import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { ReviewSchedulerService } from '../reviews/review-scheduler.service';
import { AutomationService } from '../workflow/automation.service';
import { AIService } from '../ai/ai.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/services/email.service';
import { CacheService } from '../cache/cache.service';
import { withFirestoreBackoff } from '../../common/utils/firestore-backoff.util';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly firebaseService: FirebaseService,
    private readonly reviewScheduler: ReviewSchedulerService,
    private readonly automationService: AutomationService,
    private readonly aiService: AIService,
    private readonly whatsappService: WhatsAppService,
    private readonly emailService: EmailService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  onModuleInit() {
    this.startAllJobs();
  }

  onModuleDestroy() {
    this.stopAllJobs();
  }

  private startAllJobs() {
    // 1. Escalation processor — every 60 seconds
    this.timers.push(
      setInterval(() => this.runEscalationJob(), 60_000),
    );

    // 2. Quota reset — every 24 hours
    this.timers.push(
      setInterval(() => this.runQuotaResetJob(), 24 * 60 * 60 * 1000),
    );

    // 3. Subscription expiry check — every 24 hours
    this.timers.push(
      setInterval(() => this.runSubscriptionExpiryJob(), 24 * 60 * 60 * 1000),
    );

    // 4. Weekly report — every 7 days
    this.timers.push(
      setInterval(() => this.runWeeklyReportJob(), 7 * 24 * 60 * 60 * 1000),
    );

    // 5. Trial Lifecycle Check (Day 12, 14, 16) — every 24 hours
    this.timers.push(
      setInterval(() => this.runTrialLifecycleJob(), 24 * 60 * 60 * 1000),
    );

    // 6. Paid Customer Reports Check (15-day and 30-day) — every 24 hours
    this.timers.push(
      setInterval(() => this.runPaidCustomerReportsJob(), 24 * 60 * 60 * 1000),
    );

    // Initial triggers shortly after startup
    setTimeout(() => this.runQuotaResetJob(), 30_000);
    setTimeout(() => this.runSubscriptionExpiryJob(), 45_000);
    setTimeout(() => this.runTrialLifecycleJob(), 60_000);
    setTimeout(() => this.runPaidCustomerReportsJob(), 75_000);

    this.logger.log('[Scheduler] All background jobs scheduled successfully via NestJS');
  }

  private stopAllJobs() {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.logger.log('[Scheduler] All background jobs stopped');
  }

  private async withJobLock(jobName: string, ttlSeconds: number, jobFn: () => Promise<void>): Promise<void> {
    const lockKey = `scheduler:lock:${jobName}`;
    if (this.cacheService) {
      try {
        const locked = await this.cacheService.get(lockKey);
        if (locked) {
          this.logger.debug(`[Scheduler] Job ${jobName} is locked by another instance. Skipping.`);
          return;
        }
        await this.cacheService.set(lockKey, 'locked', ttlSeconds);
      } catch {}
    }
    try {
      await jobFn();
    } finally {
      if (this.cacheService) {
        try {
          await this.cacheService.del(lockKey);
        } catch {}
      }
    }
  }

  // ─── Job Handlers ────────────────────────────────────────────────────────────

  private escalationPausedUntil = 0;
  private escalationBackoffMs = 5 * 60 * 1000; // 5 min initial backoff

  private async runEscalationJob(): Promise<void> {
    if (Date.now() < this.escalationPausedUntil) {
      return;
    }

    try {
      const result = await this.automationService.processEscalations({
        dashboardBaseUrl: this.config.get<string>('APP_URL') || this.config.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com',
      });

      if (result.isQuotaExhausted) {
        this.escalationPausedUntil = Date.now() + this.escalationBackoffMs;
        this.logger.warn(`[Scheduler] Quota limit encountered in escalation cycle. Pausing escalation job until ${new Date(this.escalationPausedUntil).toISOString()}`);
        this.escalationBackoffMs = Math.min(this.escalationBackoffMs * 2, 60 * 60 * 1000);
      } else {
        this.escalationBackoffMs = 5 * 60 * 1000;
        if (result.processed > 0 || result.errors > 0) {
          this.logger.log(`[Scheduler] Escalation cycle: processed=${result.processed}, errors=${result.errors}`);
        }
      }
    } catch (err: any) {
      const isQuota = /RESOURCE_EXHAUSTED|Quota exceeded|429/i.test(err?.message || '');
      if (isQuota) {
        this.escalationPausedUntil = Date.now() + this.escalationBackoffMs;
        this.logger.warn(`[Scheduler] Quota limit hit in escalation job: ${err.message}. Pausing escalation job for ${this.escalationBackoffMs / 1000}s`);
        this.escalationBackoffMs = Math.min(this.escalationBackoffMs * 2, 60 * 60 * 1000);
      } else {
        this.logger.error(`[Scheduler] Escalation job failed: ${err.message}`);
      }
    }
  }

  private async runTrialLifecycleJob(): Promise<void> {
    this.logger.log('[Scheduler] Running trial lifecycle check (Day 12, 14, 16)...');
    const db = this.firebaseService.getDb();
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com';
    const now = Date.now();

    try {
      const customersSnap = await db.collection('customers').get();

      for (const doc of customersSnap.docs) {
        const customerId = doc.id;
        const customer = doc.data();

        const isTrial = customer.accountStatus === 'Trial' || customer.subscriptionStatus === 'trialing';
        const isPaid = customer.subscriptionStatus === 'active';

        const trialStart = customer.trialStartDate || customer.onboardingAt || customer.createdAt;
        if (!trialStart) continue;

        const startTime = trialStart.toDate ? trialStart.toDate().getTime() : new Date(trialStart).getTime();
        const elapsedDays = Math.floor((now - startTime) / (24 * 60 * 60 * 1000));

        // Fetch primary outlet & phone
        const outletsSnap = await db.collection('outlets')
          .where('customerId', '==', customerId)
          .limit(1)
          .get();

        if (outletsSnap.empty) continue;
        const outletDoc = outletsSnap.docs[0];
        const outlet = outletDoc.data();
        const phone = outlet.whatsappNumber || outlet.primaryWhatsAppNumber || customer.phone;

        if (!phone) continue;

        const customerName = customer.name || outlet.name || 'Customer';
        const outletName = outlet.name || 'Business';

        // Trial Day 13 — Performance & Improvement Check (2 days before 15-day expiry)
        if (isTrial && elapsedDays === 13) {
          await this.whatsappService.sendTemplateByName({
            templateKey: 'TRIAL_DAY_12_PERFORMANCE',
            toNumber: phone,
            variables: {
              Name: customerName,
              'Outlet Name': outletName,
              Link: `${appUrl}/outlet/dashboard`,
            },
            idempotencyKey: `trial_d13_${customerId}`,
            outletId: outletDoc.id,
            customerId,
            planName: customer.plan || 'trial',
            isTrial: true,
          });
        }

        // Trial Day 14 — Renewal Communication (1 day before 15-day expiry)
        if (isTrial && elapsedDays === 14) {
          const renewalDateStr = customer.trialEndDate
            ? (customer.trialEndDate.toDate ? customer.trialEndDate.toDate().toLocaleDateString() : new Date(customer.trialEndDate).toLocaleDateString())
            : new Date(now + 24 * 60 * 60 * 1000).toLocaleDateString();

          const planNameStr = (customer.plan || 'Growth').replace('plan_', '').toUpperCase();
          const amountStr = customer.billingCountry === 'US' ? '39' : '1,999';

          await this.whatsappService.sendTemplateByName({
            templateKey: 'TRIAL_DAY_14_RENEWAL',
            toNumber: phone,
            variables: {
              Name: customerName,
              'Outlet Name': outletName,
              'Plan Name': planNameStr,
              'Renewal Date': renewalDateStr,
              Amount: amountStr,
              Link: `${appUrl}/outlet/settings`,
            },
            idempotencyKey: `trial_d14_${customerId}`,
            outletId: outletDoc.id,
            customerId,
            planName: customer.plan || 'trial',
            isTrial: true,
          });
        }

        // Trial Day 16 — Feedback Request (Expired & Non-paid after 15 days)
        if (!isPaid && elapsedDays >= 16 && !customer.hasConvertedToPaid) {
          await this.whatsappService.sendTemplateByName({
            templateKey: 'TRIAL_EXPIRED_FEEDBACK',
            toNumber: phone,
            variables: {
              Name: customerName,
              'Outlet Name': outletName,
            },
            idempotencyKey: `trial_d16_${customerId}`,
            outletId: outletDoc.id,
            customerId,
            planName: customer.plan || 'expired',
            isPaid: false,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`[Scheduler] Trial lifecycle job failed: ${err.message}`);
    }
  }

  private async runPaidCustomerReportsJob(): Promise<void> {
    this.logger.log('[Scheduler] Running paid customer reports check (15-day & 30-day)...');
    const db = this.firebaseService.getDb();
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('FRONTEND_BASE_URL') || 'https://app.onerepute.com';
    const now = Date.now();
    const dateKey = new Date().toISOString().slice(0, 10);

    try {
      const customersSnap = await db.collection('customers')
        .where('subscriptionStatus', '==', 'active')
        .get();

      for (const doc of customersSnap.docs) {
        const customerId = doc.id;
        const customer = doc.data();

        const activeStart = customer.createdAt;
        if (!activeStart) continue;

        const startTime = activeStart.toDate ? activeStart.toDate().getTime() : new Date(activeStart).getTime();
        const elapsedDays = Math.floor((now - startTime) / (24 * 60 * 60 * 1000));

        const outletsSnap = await db.collection('outlets')
          .where('customerId', '==', customerId)
          .limit(1)
          .get();

        if (outletsSnap.empty) continue;
        const outletDoc = outletsSnap.docs[0];
        const outlet = outletDoc.data();
        const phone = outlet.whatsappNumber || outlet.primaryWhatsAppNumber || customer.phone;

        if (!phone) continue;

        const customerName = customer.name || outlet.name || 'Customer';
        const outletName = outlet.name || 'Business';

        // 15-Day Performance Report
        if (elapsedDays > 0 && elapsedDays % 15 === 0) {
          if (phone) {
            await this.whatsappService.sendTemplateByName({
              templateKey: 'PAID_15_DAY_REPORT',
              toNumber: phone,
              variables: {
                Name: customerName,
                'Outlet Name': outletName,
                'Report Link': `${appUrl}/outlet/reports`,
              },
              idempotencyKey: `paid_15d_${customerId}_${dateKey}`,
              outletId: outletDoc.id,
              customerId,
              planName: customer.plan || 'growth',
              isPaid: true,
            });
          }

          // Trigger 15-Day Email Report
          const recipientEmail = customer.email || outlet.email;
          if (recipientEmail) {
            try {
              const reviewsCount = outlet.reviewsCount || 0;
              const averageRating = outlet.averageRating || 5.0;
              await this.emailService.sendFifteenDayReport({
                recipientEmail,
                businessName: outletName,
                customerName,
                reportPeriod: 'Last 15 Days',
                totalReviews: reviewsCount,
                averageRating,
                responseRate: '98%',
                positiveSentimentPct: 95,
              });
              this.logger.log(`[Scheduler] Queued 15-Day Report Email for ${recipientEmail} (${outletName})`);
            } catch (emailErr: any) {
              this.logger.error(`[Scheduler] Failed to queue 15-Day Report Email for ${recipientEmail}: ${emailErr.message}`);
            }
          }
        }

        // 30-Day Intelligence Report
        if (elapsedDays > 0 && elapsedDays % 30 === 0) {
          await this.whatsappService.sendTemplateByName({
            templateKey: 'PAID_30_DAY_INTELLIGENCE_REPORT',
            toNumber: phone,
            variables: {
              Name: customerName,
              'Outlet Name': outletName,
              'Report Link': `${appUrl}/outlet/reports`,
            },
            idempotencyKey: `paid_30d_${customerId}_${dateKey}`,
            outletId: outletDoc.id,
            customerId,
            planName: customer.plan || 'growth',
            isPaid: true,
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`[Scheduler] Paid reports job failed: ${err.message}`);
    }
  }

  private async runQuotaResetJob(): Promise<void> {
    this.logger.log('[Scheduler] Running subscription quota reset check...');
    const db = this.firebaseService.getDb();
    const now = Date.now();

    try {
      const customersSnap = await db.collection('customers')
        .where('subscriptionStatus', '==', 'active')
        .get();

      let resetCount = 0;
      let downgradeCount = 0;

      for (const doc of customersSnap.docs) {
        const customerId = doc.id;
        const customer = doc.data();

        if (!customer.renewalDate) continue;

        const renewalTime = customer.renewalDate.toDate
          ? customer.renewalDate.toDate().getTime()
          : new Date(customer.renewalDate).getTime();

        if (now >= renewalTime) {
          let isDowngrading = false;
          let finalPlan = customer.plan;
          let finalBillingCycle = customer.billingCycle || 'monthly';

          if (customer.pendingPlanDowngrade) {
            finalPlan = customer.pendingPlanDowngrade.plan;
            finalBillingCycle = customer.pendingPlanDowngrade.billingCycle || 'monthly';
            isDowngrading = true;
            downgradeCount++;
          }

          const cycleDays = finalBillingCycle === 'annual' ? 365 : 30;
          const nextRenewalDate = admin.firestore.Timestamp.fromMillis(Date.now() + cycleDays * 24 * 60 * 60 * 1000);

          const customerUpdate: any = {
            plan: finalPlan,
            billingCycle: finalBillingCycle,
            renewalDate: nextRenewalDate,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          if (isDowngrading) {
            customerUpdate.pendingPlanDowngrade = null;
          }

          await db.collection('customers').doc(customerId).update(customerUpdate);

          const usageRef = db.collection('customerUsage').doc(customerId);
          const usageSnap = await usageRef.get();

          if (usageSnap.exists) {
            await usageRef.update({
              review_reply_count: 0,
              resetDate: nextRenewalDate,
              currentMonth: new Date().toISOString().slice(0, 7),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            await usageRef.set({
              customerId,
              review_reply_count: 0,
              smart_qr_count: 0,
              competitor_count: 0,
              team_member_count: 0,
              resetDate: nextRenewalDate,
              currentMonth: new Date().toISOString().slice(0, 7),
              createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          resetCount++;
        }
      }

      this.logger.log(`[Scheduler] Quota reset complete: reset=${resetCount}, downgrades=${downgradeCount}`);
    } catch (err: any) {
      this.logger.error(`[Scheduler] Quota reset job error: ${err.message}`);
    }
  }

  private async runSubscriptionExpiryJob(): Promise<void> {
    this.logger.log('[Scheduler] Running daily subscription & trial check...');
    const db = this.firebaseService.getDb();

    try {
      const customersSnap = await db.collection('customers').get();
      const now = Date.now();
      const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;

      let expiredCount = 0;
      let churnRiskCount = 0;

      for (const doc of customersSnap.docs) {
        const customer = doc.data();
        const updates: any = {};

        if (customer.accountStatus === 'Trial' && customer.trialEndDate) {
          const endDate = customer.trialEndDate.toDate
            ? customer.trialEndDate.toDate().getTime()
            : new Date(customer.trialEndDate).getTime();

          if (now > endDate) {
            updates.accountStatus = 'Inactive';
            updates.paymentStatus = 'Unpaid';
            expiredCount++;
          }
        }

        const lastActivity = customer.lastActivity
          ? (customer.lastActivity.toDate ? customer.lastActivity.toDate().getTime() : new Date(customer.lastActivity).getTime())
          : 0;

        if (customer.accountStatus === 'Active' && lastActivity > 0 && (now - lastActivity) > fifteenDaysMs) {
          updates.churnRisk = true;
          churnRiskCount++;
        }

        if (Object.keys(updates).length > 0) {
          await db.collection('customers').doc(doc.id).update({
            ...updates,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      this.logger.log(`[Scheduler] Subscription check complete: expired=${expiredCount}, churnRisk=${churnRiskCount}`);
    } catch (err: any) {
      this.logger.error(`[Scheduler] Subscription check job error: ${err.message}`);
    }
  }

  private async runWeeklyReportJob(): Promise<void> {
    this.logger.log('[Scheduler] Generating weekly analytics reports...');
    const db = this.firebaseService.getDb();

    try {
      const customersSnap = await db.collection('customers').get();
      let generatedCount = 0;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
      const endDate = new Date();

      for (const doc of customersSnap.docs) {
        const customer = doc.data();

        await db.collection('reports').add({
          customerId: doc.id,
          customerName: customer.name || 'Customer',
          period: 'weekly',
          startDate,
          endDate,
          status: 'Generated',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        generatedCount++;
      }

      this.logger.log(`[Scheduler] Weekly report job complete: ${generatedCount} reports generated`);
    } catch (err: any) {
      this.logger.error(`[Scheduler] Weekly report job error: ${err.message}`);
    }
  }

  // ─── Manual Triggers ─────────────────────────────────────────────────────────

  async triggerEscalations(): Promise<void> {
    return this.runEscalationJob();
  }

  async triggerQuotaReset(): Promise<void> {
    return this.runQuotaResetJob();
  }

  async triggerWeeklyReport(): Promise<void> {
    return this.runWeeklyReportJob();
  }

  async triggerSubscriptionCheck(): Promise<void> {
    return this.runSubscriptionExpiryJob();
  }

  async triggerTrialLifecycle(): Promise<void> {
    return this.runTrialLifecycleJob();
  }

  async triggerPaidReports(): Promise<void> {
    return this.runPaidCustomerReportsJob();
  }
}
