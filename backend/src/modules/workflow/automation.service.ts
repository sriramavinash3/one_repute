/**
 * src/modules/workflow/automation.service.ts
 *
 * Pre-built automation chains & AI enrichment handlers.
 * Evaluates automation settings, triggers AI generation asynchronously,
 * posts automatic replies to Google Business Profile, dual-writes state updates to Firestore & PostgreSQL,
 * and handles escalation workflows with historical replay protection.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleBusinessService } from '../google-business/google-business.service';
import { AIService } from '../ai/ai.service';
import { NotificationService } from '../notifications/notification.service';
import { EscalationService } from '../escalation/escalation.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { normalizePhoneNumber } from '../../common/utils/phone-number.util';
import { consumeTrialResponseAllowance, releaseTrialResponseAllowance, isCustomerInTrial } from '../../common/utils/trial-entitlement.util';

export interface ReviewReceivedEvent {
  reviewId: string;
  outletId: string;
  outletName: string;
  rating: number;
  reviewText: string;
  customerName: string;
  managerPhone?: string;
  managerEmail?: string;
  businessName?: string;
  isImported?: boolean;
}

export interface EscalationCheckParams {
  maxLevel?: number;
  dashboardBaseUrl?: string;
}

const PLAN_MAX_LEVELS: Record<string, number> = {
  premium: 3,
  growth: 2,
  starter: 1,
  trial: 1,
  default: 1,
};

function getPlanMaxLevel(planName = ''): number {
  const plan = planName.toLowerCase();
  for (const [key, level] of Object.entries(PLAN_MAX_LEVELS)) {
    if (plan.includes(key)) return level;
  }
  return PLAN_MAX_LEVELS.default;
}

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly aiService: AIService,
    private readonly notificationService: NotificationService,
    private readonly escalationService: EscalationService,
    private readonly whatsappService: WhatsAppService,
    @Optional() private readonly prismaService?: PrismaService,
    @Optional() private readonly googleBusinessService?: GoogleBusinessService,
  ) {}

  /**
   * Dual-write review state updates to Firestore and PostgreSQL (Prisma).
   */
  public async dualWriteReview(reviewId: string, updateData: any): Promise<void> {
    const db = this.firebaseService.getDb();

    // 1. Firestore Primary
    try {
      await db.collection('reviews').doc(reviewId).update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err: any) {
      this.logger.error(`[DualWrite] Firestore update failed for review ${reviewId}: ${err.message}`);
    }

    // 2. PostgreSQL Prisma Secondary
    if (process.env.DATABASE_URL && this.prismaService) {
      try {
        const prismaData: any = {};
        if (updateData.status !== undefined) prismaData.status = updateData.status;
        if (updateData.aiResponse !== undefined) prismaData.aiResponse = updateData.aiResponse;
        if (updateData.replySuggestion !== undefined) prismaData.replySuggestion = updateData.replySuggestion;
        if (updateData.repliedAt !== undefined) prismaData.repliedAt = updateData.repliedAt;

        if (Object.keys(prismaData).length > 0) {
          try {
            await this.prismaService.review.update({
              where: { reviewId },
              data: prismaData,
            });
          } catch {
            await this.prismaService.review.update({
              where: { id: reviewId },
              data: prismaData,
            });
          }
        }
      } catch (prismaErr: any) {
        this.logger.warn(`[DualWrite] Prisma update skipped for review ${reviewId}: ${prismaErr.message}`);
      }
    }
  }

  /**
   * Async AI Enrichment Handler (Runs in AI Queue Worker)
   */
  async enrichReviewWithAI(params: {
    reviewId: string;
    outletId: string;
    outletName: string;
    rating: number;
    reviewText: string;
    customerName: string;
    aiVersion?: string;
    isFirstOnboardingSync?: boolean;
  }): Promise<void> {
    const { reviewId, outletId, outletName, rating, reviewText, customerName, aiVersion = 'v1.0' } = params;

    this.logger.log(`[AI-Enrichment] Processing reviewId=${reviewId}, rating=${rating}`);

    const db = this.firebaseService.getDb();
    const outletSnap = await db.collection('outlets').doc(outletId).get();
    const outlet = outletSnap.exists ? outletSnap.data() : {};

    const autoResponseEnabled = outlet?.autoResponseEnabled ?? outlet?.settings?.autoResponseEnabled ?? false;
    const minRatingForAutoResponse = Number(outlet?.minRatingForAutoResponse ?? outlet?.settings?.minRatingForAutoResponse ?? 4);

    const customerId = outlet?.customerId || outlet?.userId || outlet?.ownerId || null;

    // Atomically reserve 1 trial AI response allowance prior to calling AI service
    let trialResult = { allowedCount: 1, isTrial: false, remaining: Infinity, used: 0 };
    if (customerId) {
      trialResult = await consumeTrialResponseAllowance(db, customerId, 1);
      if (trialResult.isTrial && trialResult.allowedCount === 0) {
        this.logger.warn(`AI_RESPONSE_TRIAL_LIMIT_EXCEEDED customerId=${customerId} outletId=${outletId} reviewId=${reviewId} used=${trialResult.used}/30`);
        await this.dualWriteReview(reviewId, {
          status: 'pending',
          lastError: 'Trial limit of 30 AI reply suggestions reached. Upgrade to a paid plan to continue generating AI responses.',
          aiVersion,
        });
        return;
      }
    }

    // 1. Parallelize AI Reply Generation & Review Analysis
    let replyResult: any = null;
    let analysisResult: any = null;

    try {
      [replyResult, analysisResult] = await Promise.all([
        this.aiService.generateReviewReply({
          outletName,
          customerName,
          rating,
          reviewText,
        }),
        this.aiService.analyzeReview(rating, reviewText).catch(() => ({
          issueCategory: 'General',
          emotion: rating >= 4 ? 'Joy' : rating <= 2 ? 'Disappointment' : 'Neutral',
          sentiment: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
          priority: rating <= 2 ? 'high' : 'medium',
          isSpam: false,
        })),
      ]);
    } catch (aiErr: any) {
      // Refund reserved allowance if AI generation failed
      if (trialResult.isTrial && customerId) {
        await releaseTrialResponseAllowance(db, customerId, 1);
      }

      this.logger.error(`AUTO_REPLY_GENERATION_FAILED reviewId=${reviewId} outletId=${outletId}: ${aiErr.message}`);
      await this.dualWriteReview(reviewId, {
        status: 'failed',
        lastError: `AI reply generation failed: ${aiErr.message}`,
        aiVersion,
      });
      return;
    }

    // 2. Evaluate auto-publishing & trial auto-reply limit
    let isTrialUser = false;
    let autoReplyCount = 0;
    if (customerId) {
      const customerSnap = await db.collection('customers').doc(customerId).get();
      if (customerSnap.exists && isCustomerInTrial(customerSnap.data())) {
        isTrialUser = true;
        const usageSnap = await db.collection('customerUsage').doc(customerId).get();
        const usageData = usageSnap.exists ? usageSnap.data() : {};
        autoReplyCount = Number(
          usageData?.trial_auto_reply_count ??
          usageData?.trial_auto_replies_used ??
          0
        );
      }
    }

    const targetLocationId = outlet?.googleLocationId || outlet?.googleActiveLocation || (Array.isArray(outlet?.googleLocations) && outlet?.googleLocations[0]?.id) || null;
    const hasGoogleCredentials = Boolean(outlet?.googleAccountId && targetLocationId && outlet?.googleRefreshToken);
    const isEligibleForAutoPublish = autoResponseEnabled && rating >= minRatingForAutoResponse && hasGoogleCredentials && (!isTrialUser || autoReplyCount < 10);

    const baseUpdatePayload: any = {
      replySuggestion: replyResult.text,
      aiResponse: replyResult.text,
      aiProvider: replyResult.provider,
      aiModel: replyResult.model,
      aiVersion,
      issueCategory: analysisResult?.issueCategory,
      emotion: analysisResult?.emotion,
      sentiment: analysisResult?.sentiment,
      priority: analysisResult?.priority,
      isSpam: analysisResult?.isSpam,
    };

    if (isEligibleForAutoPublish && this.googleBusinessService) {
      const reviewSnap = await db.collection('reviews').doc(reviewId).get();
      const reviewData = reviewSnap.exists ? reviewSnap.data() : {};
      const resourceName = reviewData?.rawName || reviewData?.providerReviewId || reviewId;

      try {
        await this.googleBusinessService.postReply(
          outlet.googleAccountId,
          targetLocationId,
          outlet.googleRefreshToken,
          resourceName,
          replyResult.text,
        );

        if (isTrialUser && customerId) {
          const usageRef = db.collection('customerUsage').doc(customerId);
          const usageSnap = await usageRef.get();
          const currentCount = usageSnap.exists ? Number(usageSnap.data()?.trial_auto_reply_count ?? 0) : 0;
          await usageRef.set(
            {
              trial_auto_reply_count: currentCount + 1,
              trial_auto_replies_used: currentCount + 1,
            },
            { merge: true }
          );
        }

        const repliedAt = new Date();
        await this.dualWriteReview(reviewId, {
          ...baseUpdatePayload,
          status: 'responded',
          repliedAt,
          processedAt: repliedAt,
          lastError: null,
        });
      } catch (googleErr: any) {
        this.logger.error(`GOOGLE_REPLY_FAILED reviewId=${reviewId} outletId=${outletId}: ${googleErr.message}`);
        await this.dualWriteReview(reviewId, {
          ...baseUpdatePayload,
          status: 'failed',
          lastError: googleErr.message,
        });
      }
    } else {
      await this.dualWriteReview(reviewId, {
        ...baseUpdatePayload,
        status: 'suggested',
      });
    }
  }

  /**
   * Async Automation Handler with Historical Replay Protection
   */
  async runReviewAutomations(params: {
    reviewId: string;
    outletId: string;
    outletName: string;
    rating: number;
    reviewText: string;
    customerName: string;
    managerPhone?: string;
    managerEmail?: string;
    isImported?: boolean;
  }): Promise<void> {
    const { reviewId, outletId, rating, reviewText, customerName, outletName, isImported } = params;

    // Historical Replay Guard: Importing historical dataset must NOT trigger customer alerts!
    if (isImported) {
      this.logger.debug(`[Automation] Skipping alerts for historical review ${reviewId}`);
      return;
    }

    if (rating <= 3 && (params.managerPhone || params.managerEmail)) {
      const db = this.firebaseService.getDb();
      const reviewSnap = await db.collection('reviews').doc(reviewId).get();
      const aiSuggestedResponse = reviewSnap.data()?.replySuggestion || undefined;

      await this.notificationService.sendNegativeReviewAlert({
        outletName,
        customerName,
        rating,
        reviewText,
        managerPhone: params.managerPhone,
        managerEmail: params.managerEmail,
        aiSuggestedResponse,
      });
    }

    if (rating <= 2) {
      await this.initEscalation(reviewId, outletId, { reviewId, outletId, outletName, rating, reviewText, customerName });
      await this.checkAndSendPostTrialReengagement(outletId, rating, { reviewId, outletId, outletName, rating, reviewText, customerName });
    }
  }

  /**
   * Legacy / Orchestrated Entry point (executes enrichment & automation)
   */
  async onReviewReceived(event: ReviewReceivedEvent): Promise<void> {
    await this.enrichReviewWithAI({
      reviewId: event.reviewId,
      outletId: event.outletId,
      outletName: event.outletName,
      rating: event.rating,
      reviewText: event.reviewText,
      customerName: event.customerName,
    });

    await this.runReviewAutomations({
      reviewId: event.reviewId,
      outletId: event.outletId,
      outletName: event.outletName,
      rating: event.rating,
      reviewText: event.reviewText,
      customerName: event.customerName,
      managerPhone: event.managerPhone,
      managerEmail: event.managerEmail,
      isImported: event.isImported,
    });
  }

  private async checkAndSendPostTrialReengagement(outletId: string, rating: number, event: any): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      const outletRef = db.collection('outlets').doc(outletId);
      const outletSnap = await outletRef.get();
      if (!outletSnap.exists) return;

      const outlet = outletSnap.data();
      const isGmbConnected = Boolean(outlet.googleAccountId || outlet.googleLocationId || outlet.placeId);
      if (!isGmbConnected) return;

      const customerId = outlet.customerId;
      if (!customerId) return;

      const customerRef = db.collection('customers').doc(customerId);
      const customerSnap = await customerRef.get();
      if (!customerSnap.exists) return;

      const customer = customerSnap.data();
      const isPaid = customer.subscriptionStatus === 'active';
      if (isPaid) return;

      if (outlet.postTrialReengagementSent || customer.postTrialReengagementSent) {
        return;
      }

      const phone = outlet.whatsappNumber || outlet.primaryWhatsAppNumber || customer.phone;
      if (!phone) return;

      const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com';

      await outletRef.update({ postTrialReengagementSent: true, postTrialReengagementAt: admin.firestore.FieldValue.serverTimestamp() });
      await customerRef.update({ postTrialReengagementSent: true, postTrialReengagementAt: admin.firestore.FieldValue.serverTimestamp() });

      await this.whatsappService.sendTemplateByName({
        templateKey: 'POST_TRIAL_NEGATIVE_REVIEW_REENGAGEMENT',
        toNumber: phone,
        variables: {
          Name: customer.name || outlet.name || 'Customer',
          Rating: String(rating),
          'Outlet Name': outlet.name || 'Business',
          'Login Link': `${appUrl}/login`,
        },
        idempotencyKey: `post_trial_reengage_${customerId}`,
        outletId,
        customerId,
        isPaid: false,
      });

      this.logger.log(`[Automation] Post-trial re-engagement alert sent to ${phone} for customer ${customerId}`);
    } catch (err: any) {
      this.logger.error(`[Automation] Failed post-trial re-engagement check: ${err.message}`);
    }
  }

  private async initEscalation(reviewId: string, outletId: string, event: any): Promise<void> {
    const db = this.firebaseService.getDb();
    const firstEscalationMs = 30 * 60 * 1000;
    const nextEscalationTime = new Date(Date.now() + firstEscalationMs);

    await this.dualWriteReview(reviewId, {
      escalationStatus: 'level_1_pending',
      escalationLevel: 0,
      nextEscalationTime: admin.firestore.Timestamp.fromDate(nextEscalationTime),
      escalationInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  async processEscalations(params: EscalationCheckParams = {}): Promise<{ processed: number; errors: number; isQuotaExhausted?: boolean }> {
    const { dashboardBaseUrl = process.env.APP_URL || 'https://app.onerepute.com' } = params;
    const db = this.firebaseService.getDb();
    const now = new Date();

    let docs: admin.firestore.QueryDocumentSnapshot[] = [];
    try {
      const querySnap = await db.collection('reviews')
        .where('escalationStatus', 'in', ['level_1_pending', 'level_2_pending', 'level_3_pending'])
        .limit(50)
        .get();

      docs = querySnap.docs.filter((doc) => {
        const data = doc.data();
        if (!data.nextEscalationTime) return true;
        const nextTime = data.nextEscalationTime.toDate ? data.nextEscalationTime.toDate() : new Date(data.nextEscalationTime);
        return nextTime <= now;
      });
    } catch (err: any) {
      const isQuota = /RESOURCE_EXHAUSTED|Quota exceeded|429/i.test(err?.message || '');
      this.logger.error(`[Automation] Failed to query escalations: ${err.message}`);
      return { processed: 0, errors: 1, isQuotaExhausted: isQuota };
    }

    let processed = 0, errors = 0;
    const outletCache = new Map<string, any>();
    const customerCache = new Map<string, any>();
    const settingsCache = new Map<string, any>();

    for (const doc of docs) {
      try {
        await this.processOneEscalation(doc, db, dashboardBaseUrl, { outletCache, customerCache, settingsCache });
        processed++;
      } catch (err: any) {
        this.logger.error(`[Automation] Escalation failed for review ${doc.id}: ${err.message}`);
        errors++;
      }
    }

    return { processed, errors };
  }

  private async processOneEscalation(
    doc: any,
    db: any,
    dashboardBaseUrl: string,
    caches?: { outletCache?: Map<string, any>; customerCache?: Map<string, any>; settingsCache?: Map<string, any> },
  ): Promise<void> {
    const data = doc.data();
    const reviewId = doc.id;

    if (['responded', 'resolved', 'ignored'].includes(data.status)) {
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    let outlet = caches?.outletCache?.get(data.outletId);
    if (!outlet) {
      const outletSnap = await db.collection('outlets').doc(data.outletId).get();
      if (!outletSnap.exists) {
        await doc.ref.update({ escalationStatus: 'completed' });
        return;
      }
      outlet = outletSnap.data();
      if (caches?.outletCache) caches.outletCache.set(data.outletId, outlet);
    }

    if (outlet?.status === 'removed' || outlet?.isDeleted === true || outlet?.status === 'deleted') {
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const customerId = outlet?.customerId;
    let maxLevel = getPlanMaxLevel('starter');
    if (customerId) {
      try {
        let customer = caches?.customerCache?.get(customerId);
        if (!customer) {
          const customerSnap = await db.collection('customers').doc(customerId).get();
          if (customerSnap.exists) {
            customer = customerSnap.data() || {};
            if (caches?.customerCache) caches.customerCache.set(customerId, customer);
          }
        }
        if (customer) {
          const planName = customer.planName || customer.plan || 'starter';
          maxLevel = getPlanMaxLevel(planName);
          if (['unpaid', 'inactive', 'past_due'].includes(customer.paymentStatus)) {
            await doc.ref.update({ escalationStatus: 'completed' });
            return;
          }
        }
      } catch (err: any) {}
    }

    const currentLevelStr = (data.escalationStatus || '').replace('level_', '').replace('_pending', '');
    const currentLevel = parseInt(currentLevelStr) || 1;

    if (currentLevel > maxLevel) {
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const escalationContacts = await this.getEscalationContactsAsync(currentLevel, data.outletId, outlet, caches?.settingsCache);
    if (!escalationContacts.length) {
      await doc.ref.update({ escalationStatus: 'completed' });
      return;
    }

    const idempotencyKey = `esc_${reviewId}_lvl_${currentLevel}`;
    const dispatchDocRef = db.collection('escalationDispatches').doc(idempotencyKey);
    const dispatchSnap = await dispatchDocRef.get();

    if (!dispatchSnap.exists) {
      const pendingSince = this.formatPendingTime(data.escalationInitiatedAt || data.reviewTimestamp || data.createdAt);
      const dashboardUrl = `${dashboardBaseUrl}/reviews/${reviewId}`;

      for (const contact of escalationContacts) {
        await this.notificationService.sendEscalationAlert({
          businessName: outlet.name || data.outletName || 'Business',
          customerName: data.customerName,
          rating: data.rating,
          reviewText: data.text || data.reviewText,
          level: currentLevel,
          pendingSince,
          dashboardUrl,
          contactPhone: contact.phone,
          contactEmail: contact.email,
        });
      }

      await dispatchDocRef.set({
        reviewId,
        outletId: data.outletId,
        level: currentLevel,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        contactsCount: escalationContacts.length,
      });

      await db.collection('activityLogs').add({
        type: `ESCALATION_LEVEL_${currentLevel}`,
        reviewId,
        outletId: data.outletId,
        level: currentLevel,
        contacts: escalationContacts.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    const nextLevel = currentLevel + 1;
    const intervalMs = await this.getEscalationIntervalAsync(nextLevel, data.outletId, caches?.settingsCache);
    const nextEscalationTime = new Date(Date.now() + intervalMs);

    if (nextLevel > maxLevel) {
      await doc.ref.update({
        escalationStatus: 'completed',
        escalationLevel: currentLevel,
        lastEscalatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else {
      await doc.ref.update({
        escalationStatus: `level_${nextLevel}_pending`,
        escalationLevel: currentLevel,
        nextEscalationTime: admin.firestore.Timestamp.fromDate(nextEscalationTime),
        lastEscalatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }

  private async getEscalationContactsAsync(level: number, outletId: string, outlet: any, settingsCache?: Map<string, any>): Promise<Array<{ phone?: string; email?: string }>> {
    try {
      let settings = settingsCache?.get(outletId);
      if (!settings) {
        settings = await this.escalationService.getSettings(outletId);
        if (settingsCache) settingsCache.set(outletId, settings);
      }
      if (!settings.masterEnabled) return [];

      const lvlConfig = settings.levels.find(l => l.level === level);
      if (lvlConfig && lvlConfig.enabled && lvlConfig.whatsappNumber) {
        const fullPhone = normalizePhoneNumber(lvlConfig.whatsappNumber, lvlConfig.countryCode || '+91');
        return [{ phone: fullPhone, email: lvlConfig.email }];
      }
    } catch {}

    return this.getEscalationContacts(level, outlet, null);
  }

  private getEscalationContacts(level: number, outlet: any, review: any): Array<{ phone?: string; email?: string }> {
    const contacts: Array<{ phone?: string; email?: string }> = [];

    if (level === 1) {
      const rawNum = outlet?.primaryWhatsAppNumber || outlet?.whatsappNumber || outlet?.managerPhone;
      const cc = outlet?.countryCode || '+91';
      if (rawNum) {
        const phone = normalizePhoneNumber(String(rawNum), cc);
        contacts.push({ phone, email: outlet.primaryEmail || outlet.managerEmail || outlet.email });
      }
    } else if (level === 2) {
      if (outlet?.regionalManagerPhone || outlet?.regionalManagerEmail) {
        const phone = outlet.regionalManagerPhone ? normalizePhoneNumber(String(outlet.regionalManagerPhone), outlet.countryCode || '+91') : undefined;
        contacts.push({ phone, email: outlet.regionalManagerEmail });
      }
    } else if (level === 3) {
      if (outlet?.directorPhone || outlet?.directorEmail) {
        const phone = outlet.directorPhone ? normalizePhoneNumber(String(outlet.directorPhone), outlet.countryCode || '+91') : undefined;
        contacts.push({ phone, email: outlet.directorEmail });
      }
    }

    return contacts.filter((c) => c.phone || c.email);
  }

  private async getEscalationIntervalAsync(level: number, outletId: string, settingsCache?: Map<string, any>): Promise<number> {
    try {
      let settings = settingsCache?.get(outletId);
      if (!settings) {
        settings = await this.escalationService.getSettings(outletId);
        if (settingsCache) settingsCache.set(outletId, settings);
      }
      const lvlConfig = settings.levels.find(l => l.level === level);
      if (lvlConfig && lvlConfig.escalationMinutes) {
        return lvlConfig.escalationMinutes * 60 * 1000;
      }
    } catch {}

    return this.getEscalationInterval(level);
  }

  private getEscalationInterval(level: number): number {
    const intervals: Record<number, number> = {
      1: 30 * 60 * 1000,
      2: 60 * 60 * 1000,
      3: 120 * 60 * 1000,
    };
    return intervals[level] || 60 * 60 * 1000;
  }

  private formatPendingTime(timestamp: any): string {
    if (!timestamp) return 'Just now';
    const time = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = Date.now() - time.getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ${mins % 60}m ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }
}
