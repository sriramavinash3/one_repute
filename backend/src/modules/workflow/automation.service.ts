/**
 * src/modules/workflow/automation.service.ts
 *
 * Pre-built automation chains — hardcoded business workflows.
 * These are the production-grade equivalents of the legacy escalationCron.js logic.
 *
 * Chain: Review received → Generate AI reply → Notify manager → Escalate after threshold → Manager escalation → Close
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { AIService } from '../ai/ai.service';
import { NotificationService } from '../notifications/notification.service';
import axios from 'axios';

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
}

export interface EscalationCheckParams {
  maxLevel?: number;
  dashboardBaseUrl?: string;
}

// Plan-gating for escalation levels (mirrors legacy logic)
const PLAN_MAX_LEVELS: Record<string, number> = {
  premium: 3,
  growth: 2,
  starter: 1,
  default: 1,
};

function getPlanMaxLevel(planName = ''): number {
  const plan = planName.toLowerCase();
  for (const [key, level] of Object.entries(PLAN_MAX_LEVELS)) {
    if (plan.includes(key)) return level;
  }
  return PLAN_MAX_LEVELS.default;
}

import { EscalationService } from '../escalation/escalation.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { normalizePhoneNumber } from '../../common/utils/phone-number.util';

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
  ) {}

  /**
   * Execute the full review automation chain for a newly received review.
   * Called by ReviewSyncService after a new review is written.
   */
  async onReviewReceived(event: ReviewReceivedEvent): Promise<void> {
    const { reviewId, outletId, rating, reviewText, customerName, outletName } = event;

    this.logger.log(`[Automation] onReviewReceived: reviewId=${reviewId}, rating=${rating}`);

    // 1. Generate AI reply for all reviews
    try {
      const replyResult = await this.aiService.generateReviewReply({
        outletName,
        customerName,
        rating,
        reviewText,
      });

      // Persist suggestion
      const db = this.firebaseService.getDb();

      await db.collection('reviews').doc(reviewId).update({
        replySuggestion: replyResult.text,
        aiResponse: replyResult.text,
        status: 'suggested',
        aiProvider: replyResult.provider,
        aiModel: replyResult.model,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      this.logger.debug(`[Automation] AI reply generated for ${reviewId}`);

      // 2. Analyze review
      const analysis = await this.aiService.analyzeReview(rating, reviewText);
      await db.collection('reviews').doc(reviewId).update({
        issueCategory: analysis.issueCategory,
        emotion: analysis.emotion,
        sentiment: analysis.sentiment,
        priority: analysis.priority,
        isSpam: analysis.isSpam,
      });

      // 3. Notify manager of negative review
      if (rating <= 3 && (event.managerPhone || event.managerEmail)) {
        await this.notificationService.sendNegativeReviewAlert({
          outletName,
          customerName,
          rating,
          reviewText,
          managerPhone: event.managerPhone,
          managerEmail: event.managerEmail,
          aiSuggestedResponse: replyResult.text,
        });
      }

      // 4. Set escalation tracking & post-trial re-engagement for negative reviews
      if (rating <= 2) {
        await this.initEscalation(reviewId, outletId, event);
        await this.checkAndSendPostTrialReengagement(outletId, rating, event);
      }
    } catch (err: any) {
      this.logger.error(`[Automation] onReviewReceived chain failed for ${reviewId}: ${err.message}`);
    }
  }

  /**
   * Post-Trial Re-Engagement Trigger — Fires ONCE on first 1-2 star review after trial expiration
   * when non-paid and GMB is still connected.
   */
  private async checkAndSendPostTrialReengagement(outletId: string, rating: number, event: ReviewReceivedEvent): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      const outletRef = db.collection('outlets').doc(outletId);
      const outletSnap = await outletRef.get();
      if (!outletSnap.exists) return;

      const outlet = outletSnap.data();

      // Check GMB still connected
      const isGmbConnected = Boolean(outlet.googleAccountId || outlet.googleLocationId || outlet.placeId);
      if (!isGmbConnected) return;

      // Check customer subscription status
      const customerId = outlet.customerId;
      if (!customerId) return;

      const customerRef = db.collection('customers').doc(customerId);
      const customerSnap = await customerRef.get();
      if (!customerSnap.exists) return;

      const customer = customerSnap.data();
      const isPaid = customer.subscriptionStatus === 'active';
      if (isPaid) return; // Only send to non-paid accounts

      // Deduplication guard — verify message has NOT previously been sent
      if (outlet.postTrialReengagementSent || customer.postTrialReengagementSent) {
        return;
      }

      const phone = outlet.whatsappNumber || outlet.primaryWhatsAppNumber || customer.phone;
      if (!phone) return;

      const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com';

      // Atomic lock
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

  /**
   * Initialize escalation tracking for a negative review.
   */
  private async initEscalation(reviewId: string, outletId: string, event: ReviewReceivedEvent): Promise<void> {
    const db = this.firebaseService.getDb();


    const firstEscalationMs = 30 * 60 * 1000; // 30 minutes
    const nextEscalationTime = new Date(Date.now() + firstEscalationMs);

    await db.collection('reviews').doc(reviewId).update({
      escalationStatus: 'level_1_pending',
      escalationLevel: 0,
      nextEscalationTime: admin.firestore.Timestamp.fromDate(nextEscalationTime),
      escalationInitiatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    this.logger.debug(`[Automation] Escalation initiated for review ${reviewId}`);
  }

  /**
   * Process pending escalations — called by the scheduler every minute.
   * Replicates the full logic of legacy escalationCron.js.
   */
  async processEscalations(params: EscalationCheckParams = {}): Promise<{ processed: number; errors: number }> {
    const { dashboardBaseUrl = process.env.APP_URL || 'https://app.onerepute.com' } = params;

    const db = this.firebaseService.getDb();
    const now = new Date();

    // Fetch all reviews pending escalation (filtered in memory to avoid Firestore composite index requirement)
    let docs: admin.firestore.QueryDocumentSnapshot[] = [];
    try {
      const querySnap = await db.collection('reviews')
        .where('escalationStatus', 'in', ['level_1_pending', 'level_2_pending', 'level_3_pending'])
        .limit(100)
        .get();

      docs = querySnap.docs.filter((doc) => {
        const data = doc.data();
        if (!data.nextEscalationTime) return true;
        const nextTime = data.nextEscalationTime.toDate ? data.nextEscalationTime.toDate() : new Date(data.nextEscalationTime);
        return nextTime <= now;
      });
    } catch (err: any) {
      this.logger.error(`[Automation] Failed to query escalations: ${err.message}`);
      return { processed: 0, errors: 1 };
    }

    let processed = 0, errors = 0;

    for (const doc of docs) {
      try {
        await this.processOneEscalation(doc, db, dashboardBaseUrl);
        processed++;
      } catch (err: any) {
        this.logger.error(`[Automation] Escalation failed for review ${doc.id}: ${err.message}`);
        errors++;
      }
    }

    if (processed > 0 || errors > 0) {
      this.logger.log(`[Automation] Escalation cycle: processed=${processed}, errors=${errors}`);
    }

    return { processed, errors };
  }

  private async processOneEscalation(doc: any, db: any, dashboardBaseUrl: string): Promise<void> {
    const data = doc.data();
    const reviewId = doc.id;

    // 1. Stop conditions
    if (['responded', 'resolved', 'ignored'].includes(data.status)) {
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    // 2. Load outlet + customer plan
    const outletSnap = await db.collection('outlets').doc(data.outletId).get();
    if (!outletSnap.exists) {
      await doc.ref.update({ escalationStatus: 'completed' });
      return;
    }
    const outlet = outletSnap.data();

    // Guard: stop escalation processing for removed or deleted outlets
    if (outlet?.status === 'removed' || outlet?.isDeleted === true || outlet?.status === 'deleted') {
      this.logger.warn(`[Automation] Stopping escalation for removed outlet ${data.outletId}, review ${doc.id}`);
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    const customerId = outlet?.customerId;
    let maxLevel = getPlanMaxLevel('starter'); // Default to 1 (Starter) if customer details not resolved
    if (customerId) {
      try {
        const customerSnap = await db.collection('customers').doc(customerId).get();
        if (customerSnap.exists) {
          const customer = customerSnap.data() || {};
          const planName = customer.planName || customer.plan || 'starter';
          maxLevel = getPlanMaxLevel(planName);
          // Check subscription still active
          if (['unpaid', 'inactive', 'past_due'].includes(customer.paymentStatus)) {
            this.logger.warn(`[Automation] Stopping escalation for inactive customer ${customerId}`);
            await doc.ref.update({ escalationStatus: 'completed' });
            return;
          }
        }
      } catch (err: any) {
        this.logger.warn(`[Automation] Failed to fetch customer plan for ${customerId}: ${err.message}`);
      }
    }

    const currentLevelStr = (data.escalationStatus || '').replace('level_', '').replace('_pending', '');
    const currentLevel = parseInt(currentLevelStr) || 1;

    // STRICT SERVER-SIDE ENTITLEMENT GATING:
    // If current level exceeds user's max plan level, reject & complete without sending messages.
    if (currentLevel > maxLevel) {
      this.logger.warn(`[Automation] Blocking Level ${currentLevel} escalation for review ${reviewId}: Plan supports up to Level ${maxLevel}`);
      await doc.ref.update({ escalationStatus: 'completed', updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      return;
    }

    // 3. Build escalation contacts for this level
    const escalationContacts = await this.getEscalationContactsAsync(currentLevel, data.outletId, outlet);
    if (!escalationContacts.length) {
      this.logger.warn(`[Automation] No valid escalation contacts configured for Level ${currentLevel}, outlet ${data.outletId}`);
      await doc.ref.update({ escalationStatus: 'completed' });
      return;
    }

    // 4. Idempotency Guard — Check if message for this (reviewId, level) was already dispatched
    const idempotencyKey = `esc_${reviewId}_lvl_${currentLevel}`;
    const dispatchDocRef = db.collection('escalationDispatches').doc(idempotencyKey);
    const dispatchSnap = await dispatchDocRef.get();

    if (dispatchSnap.exists) {
      this.logger.warn(`[Automation] Escalation alert already dispatched for key ${idempotencyKey}. Skipping duplicate send.`);
    } else {
      // Send alerts
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

      // Record dispatch doc atomically to prevent duplicate sends
      await dispatchDocRef.set({
        reviewId,
        outletId: data.outletId,
        level: currentLevel,
        dispatchedAt: admin.firestore.FieldValue.serverTimestamp(),
        contactsCount: escalationContacts.length,
      });

      // Log to activityLogs
      await db.collection('activityLogs').add({
        type: `ESCALATION_LEVEL_${currentLevel}`,
        reviewId,
        outletId: data.outletId,
        level: currentLevel,
        contacts: escalationContacts.length,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 5. Advance escalation level
    const nextLevel = currentLevel + 1;
    const intervalMs = await this.getEscalationIntervalAsync(nextLevel, data.outletId);
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

  private async getEscalationContactsAsync(level: number, outletId: string, outlet: any): Promise<Array<{ phone?: string; email?: string }>> {
    try {
      const settings = await this.escalationService.getSettings(outletId);
      if (!settings.masterEnabled) return [];

      const lvlConfig = settings.levels.find(l => l.level === level);
      if (lvlConfig && lvlConfig.enabled && lvlConfig.whatsappNumber) {
        const fullPhone = normalizePhoneNumber(lvlConfig.whatsappNumber, lvlConfig.countryCode || '+91');
        return [{ phone: fullPhone, email: lvlConfig.email }];
      }
    } catch (err: any) {
      this.logger.warn(`Could not load escalation settings for level ${level}: ${err.message}`);
    }

    // Fallback to legacy outlet properties
    return this.getEscalationContacts(level, outlet, null);
  }

  private getEscalationContacts(level: number, outlet: any, review: any): Array<{ phone?: string; email?: string }> {
    const contacts: Array<{ phone?: string; email?: string }> = [];

    if (level === 1) {
      // Primary WhatsApp Number is always the 1st escalation contact
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

  private async getEscalationIntervalAsync(level: number, outletId: string): Promise<number> {
    try {
      const settings = await this.escalationService.getSettings(outletId);
      const lvlConfig = settings.levels.find(l => l.level === level);
      if (lvlConfig && lvlConfig.escalationMinutes) {
        return lvlConfig.escalationMinutes * 60 * 1000;
      }
    } catch {}

    return this.getEscalationInterval(level);
  }

  private getEscalationInterval(level: number): number {
    const intervals: Record<number, number> = {
      1: 30 * 60 * 1000,  // 30 min
      2: 60 * 60 * 1000,  // 1 hour
      3: 120 * 60 * 1000, // 2 hours
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
