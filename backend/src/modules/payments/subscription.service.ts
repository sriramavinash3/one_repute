import { Injectable, Logger, Optional } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from './plan.service';
import { PaymentsConfigService } from './payments-config.service';
import { CacheService } from '../cache/cache.service';
import { isCustomerInTrial, TOTAL_TRIAL_RESPONSE_LIMIT } from '../../common/utils/trial-entitlement.util';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly planService: PlanService,
    private readonly configService: PaymentsConfigService,
    @Optional() private readonly cacheService?: CacheService,
  ) {}

  private async invalidateCache(customerId?: string) {
    this.logger.debug(`[SubscriptionService] Cache invalidated for ${customerId || 'all'}`);
    if (customerId && this.cacheService) {
      try {
        await this.cacheService.del(`subscription:${customerId}`);
      } catch {}
    }
  }

  async getBillingInfo(customerId: string) {
    const cacheKey = `subscription:${customerId}`;
    if (this.cacheService) {
      try {
        const cached = await this.cacheService.get(cacheKey);
        if (cached) return cached;
      } catch {}
    }

    const db = this.firebaseService.getDb();

    const [customerSnap, usageSnap] = await Promise.all([
      db.collection('customers').doc(customerId).get(),
      db.collection('customerUsage').doc(customerId).get(),
    ]);

    const customer = customerSnap.exists ? customerSnap.data() : {
      plan: 'plan_starter',
      billingCycle: 'monthly',
      subscriptionStatus: 'inactive',
      renewalDate: null,
      cancelAtPeriodEnd: false,
      pendingPlanDowngrade: null,
    };

    const usage = usageSnap.exists ? usageSnap.data() : {
      review_reply_count: 0,
      smart_qr_count: 0,
      competitor_count: 0,
      team_member_count: 0,
    };

    const country = customer.billingCountry || 'IN';
    const plans = await this.planService.getAllPlans(country);

    const now = new Date();
    let currentPlan = customer.plan || 'plan_starter';
    let status = customer.subscriptionStatus || 'inactive';
    let scheduledPlan = customer.scheduledPlan || null;

    let onboardingTimestamp = customer.onboardingAt || customer.onboardedAt || customer.createdAt;
    let onboardingDate = onboardingTimestamp ? (onboardingTimestamp.toDate ? onboardingTimestamp.toDate() : new Date(onboardingTimestamp)) : null;

    let trialStartDate = customer.trialStartDate ? (customer.trialStartDate.toDate ? customer.trialStartDate.toDate() : new Date(customer.trialStartDate)) : onboardingDate;
    let trialEndDate = (customer.trialEndDate || customer.trialEndsAt)
      ? ((customer.trialEndDate?.toDate ? customer.trialEndDate.toDate() : new Date(customer.trialEndDate || customer.trialEndsAt)))
      : (trialStartDate ? new Date(trialStartDate.getTime() + 15 * 24 * 60 * 60 * 1000) : null);

    let paidPlanStartDate = customer.paidPlanStartDate ? (customer.paidPlanStartDate.toDate ? customer.paidPlanStartDate.toDate() : new Date(customer.paidPlanStartDate)) : null;

    let remainingTrialDays = 0;
    if (trialEndDate && trialEndDate.getTime() > now.getTime()) {
      remainingTrialDays = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Auto-transition expired trial to 'expired' if not paid and trial date has passed
    if (status === 'trialing' && trialEndDate && now.getTime() >= trialEndDate.getTime()) {
      status = 'expired';
      db.collection('customers').doc(customerId).set({
        subscriptionStatus: 'expired',
        updatedAt: new Date(),
      }, { merge: true }).catch(e => this.logger.error(`Failed trial expiration status update: ${e.message}`));
    }

    // Auto-transition trial_paid_scheduled to active if trial end date has passed
    if (status === 'trial_paid_scheduled' && trialEndDate && now.getTime() >= trialEndDate.getTime()) {
      status = 'active';
      if (scheduledPlan) {
        currentPlan = scheduledPlan;
      }
      db.collection('customers').doc(customerId).set({
        subscriptionStatus: 'active',
        plan: currentPlan,
        paidPlanScheduled: false,
        updatedAt: new Date(),
      }, { merge: true }).catch(e => this.logger.error(`Failed auto-transition: ${e.message}`));
    }

    const isTrialActive = isCustomerInTrial({ ...customer, subscriptionStatus: status });
    const effectivePlan = isTrialActive && (!customer.plan || customer.plan === 'plan_starter') ? 'trial' : currentPlan;

    const trialResponsesUsed = Number(
      usage.trial_review_responses_used ??
      usage.trial_ai_suggestion_count ??
      0
    );

    const invoicesSnap = await db.collection('invoices')
      .where('customerId', '==', customerId)
      .get();

    const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    invoices.sort((a: any, b: any) => {
      const dateA = a.issuedAt?.toDate ? a.issuedAt.toDate() : new Date(a.issuedAt || 0);
      const dateB = b.issuedAt?.toDate ? b.issuedAt.toDate() : new Date(b.issuedAt || 0);
      return dateB.getTime() - dateA.getTime();
    });

    const result = {
      subscription: {
        plan: effectivePlan,
        scheduledPlan,
        billingCycle: customer.billingCycle || 'monthly',
        status,
        paidPlanScheduled: customer.paidPlanScheduled || false,
        renewalDate: customer.renewalDate ? (customer.renewalDate.toDate ? customer.renewalDate.toDate() : customer.renewalDate) : null,
        cancelAtPeriodEnd: customer.cancelAtPeriodEnd || false,
        pendingPlanDowngrade: customer.pendingPlanDowngrade || null,
        billingCountry: country,
        currency: customer.currency || (country === 'IN' ? 'INR' : 'USD'),
        trialStartDate,
        trialEndDate,
        trialDurationDays: 15,
        paidPlanStartDate,
        remainingTrialDays,
      },
      usage: {
        repliesUsed: usage.review_reply_count || 0,
        qrsUsed: usage.smart_qr_count || 0,
        competitorsUsed: usage.competitor_count || 0,
        usersUsed: usage.team_member_count || 0,
        trialResponsesUsed,
        trialResponseLimit: TOTAL_TRIAL_RESPONSE_LIMIT,
        remainingTrialResponses: Math.max(0, TOTAL_TRIAL_RESPONSE_LIMIT - trialResponsesUsed),
        // Deprecated backward-compatibility fallbacks
        trialAutoRepliesUsed: usage.trial_auto_reply_count ?? usage.trial_auto_replies_used ?? 0,
        trialAutoReplyLimit: 10,
        trialSuggestionsUsed: usage.trial_ai_suggestion_count ?? usage.trial_suggestions_used ?? trialResponsesUsed,
        trialSuggestionLimit: 30,
        isTrialActive,
      },
      plans,
      invoices,
    };

    if (this.cacheService) {
      try {
        await this.cacheService.set(cacheKey, result, 600); // 10 min TTL
      } catch {}
    }

    return result;
  }

  async changePlan(customerId: string, newPlanId: string, billingCycle: string = 'monthly') {
    const db = this.firebaseService.getDb();
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) throw new Error('Customer not found');
    const customer = customerDoc.data();

    const planDoc = await db.collection('plans').doc(newPlanId).get();
    if (!planDoc.exists) throw new Error('New plan not found');
    const planData = planDoc.data();

    const oldPlanDoc = await db.collection('plans').doc(customer.plan || 'plan_starter').get();
    const oldPlanSortOrder = oldPlanDoc.exists ? oldPlanDoc.data().sortOrder : 0;
    const newPlanSortOrder = planData.sortOrder;

    const isUpgrade = newPlanSortOrder > oldPlanSortOrder;
    const country = customer.billingCountry || 'IN';
    const localizedPrice = await this.planService.getPlanPrice(newPlanId, country);

    const newRazorpayPlanId = billingCycle === 'annual'
      ? localizedPrice.razorpayAnnualPlanId
      : billingCycle === 'quarterly'
      ? localizedPrice.razorpayQuarterlyPlanId
      : localizedPrice.razorpayMonthlyPlanId;

    const subscriptionId = customer.razorpaySubscriptionId;

    if (isUpgrade) {
      if (subscriptionId) {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({
          key_id: this.configService.razorpayKeyId,
          key_secret: this.configService.razorpayKeySecret,
        });
        await rzp.subscriptions.update(subscriptionId, {
          plan_id: newRazorpayPlanId,
          schedule_change: 'now',
        });
      }

      const renewalTime = Date.now() + (billingCycle === 'annual' ? 365 : billingCycle === 'quarterly' ? 90 : 30) * 24 * 60 * 60 * 1000;
      const customerUpdate = {
        plan: newPlanId,
        billingCycle,
        currency: localizedPrice.currency,
        subscriptionStatus: 'active',
        renewalDate: new Date(renewalTime),
        updatedAt: new Date(),
      };

      await db.collection('customers').doc(customerId).set(customerUpdate, { merge: true });

      if (process.env.DATABASE_URL && subscriptionId) {
        try {
          await this.prismaService.subscription.upsert({
            where: { id: subscriptionId },
            update: {
              planId: newPlanId,
              billingCycle,
              status: 'active',
              currency: localizedPrice.currency,
              renewalDate: new Date(renewalTime),
            },
            create: {
              id: subscriptionId,
              customerId,
              planId: newPlanId,
              billingCycle,
              status: 'active',
              currency: localizedPrice.currency,
              renewalDate: new Date(renewalTime),
            },
          });
        } catch (err: any) {
          this.logger.error(`Prisma changePlan sync failed: ${err.message}`);
        }
      }

      const usageRef = db.collection('customerUsage').doc(customerId);
      const usageSnap = await usageRef.get();
      if (usageSnap.exists) {
        await usageRef.update({ review_reply_count: 0 });
      }

      this.invalidateCache();
      return { success: true, message: `Upgraded to ${planData.name} plan successfully.` };
    } else {
      await db.collection('customers').doc(customerId).set({
        pendingPlanDowngrade: {
          plan: newPlanId,
          billingCycle,
        },
        updatedAt: new Date(),
      }, { merge: true });

      return { success: true, message: `Downgrade scheduled. You will transition to the ${planData.name} plan at the end of your billing cycle.` };
    }
  }

  async cancelSubscription(customerId: string) {
    const db = this.firebaseService.getDb();
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) throw new Error('Customer not found');

    const customer = doc.data();
    const subscriptionId = customer.razorpaySubscriptionId;

    if (!subscriptionId) {
      throw new Error('No active subscription found to cancel');
    }

    const Razorpay = require('razorpay');
    const rzp = new Razorpay({
      key_id: this.configService.razorpayKeyId,
      key_secret: this.configService.razorpayKeySecret,
    });
    await rzp.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 });

    await db.collection('customers').doc(customerId).set({
      cancelAtPeriodEnd: true,
      subscriptionStatus: 'cancelled',
      updatedAt: new Date(),
    }, { merge: true });

    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.subscription.update({
          where: { id: subscriptionId },
          data: {
            cancelAtPeriodEnd: true,
            status: 'cancelled',
          },
        });
      } catch (err: any) {
        this.logger.error(`Prisma cancelSubscription sync failed: ${err.message}`);
      }
    }

    this.invalidateCache();
    return { success: true, message: 'Subscription will be cancelled at the end of the current period.' };
  }

  async resumeSubscription(customerId: string) {
    const db = this.firebaseService.getDb();
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) throw new Error('Customer not found');

    const customer = doc.data();
    const subscriptionId = customer.razorpaySubscriptionId;

    if (!subscriptionId) {
      throw new Error('No subscription found to resume');
    }

    await db.collection('customers').doc(customerId).set({
      cancelAtPeriodEnd: false,
      subscriptionStatus: 'active',
      updatedAt: new Date(),
    }, { merge: true });

    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.subscription.update({
          where: { id: subscriptionId },
          data: {
            cancelAtPeriodEnd: false,
            status: 'active',
          },
        });
      } catch (err: any) {
        this.logger.error(`Prisma resumeSubscription sync failed: ${err.message}`);
      }
    }

    this.invalidateCache();
    return { success: true, message: 'Subscription successfully resumed.' };
  }
}
