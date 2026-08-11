import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from './plan.service';
import { PaymentsConfigService } from './payments-config.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private razorpayInstance: any = null;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly planService: PlanService,
    private readonly configService: PaymentsConfigService,
  ) {}

  private getRazorpay() {
    if (!this.razorpayInstance) {
      const keyId = this.configService.razorpayKeyId;
      const keySecret = this.configService.razorpayKeySecret;
      if (!keyId || !keySecret) {
        throw new Error('Razorpay API credentials are not configured on the server.');
      }
      const Razorpay = require('razorpay');
      this.razorpayInstance = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
    }
    return this.razorpayInstance;
  }

  async createSubscription(customerId: string, planId: string, billingCycle: string = 'monthly', countryCode: string = 'IN') {
    try {
      const db = this.firebaseService.getDb();
      const planDoc = await db.collection('plans').doc(planId).get();
      if (!planDoc.exists) {
        throw new Error(`Plan ${planId} not found in database`);
      }

      const customerSnap = await db.collection('customers').doc(customerId).get();
      const customerData = customerSnap.exists ? customerSnap.data() : null;
      const isTrialEligible = !customerData || customerData.trialUsed !== true;

      const localizedPrice = await this.planService.getPlanPrice(planId, countryCode);
      const razorpayPlanId = billingCycle === 'annual'
        ? localizedPrice.razorpayAnnualPlanId
        : billingCycle === 'quarterly'
        ? localizedPrice.razorpayQuarterlyPlanId
        : localizedPrice.razorpayMonthlyPlanId;

      if (!razorpayPlanId || razorpayPlanId.endsWith('_dummy')) {
        this.logger.error(`Production payment failure: Razorpay plan configuration missing or invalid for ${planId}`);
        throw new Error('Unable to start payment because the selected subscription plan is not configured correctly on the server.');
      }

      const subscriptionPayload: any = {
        plan_id: razorpayPlanId,
        customer_notify: 1,
        total_count: billingCycle === 'annual' ? 10 : billingCycle === 'quarterly' ? 40 : 120,
        quantity: 1,
      };

      let trialDays = 0;
      let trialStartDate: Date | null = null;
      let trialEndDate: Date | null = null;

      if (isTrialEligible) {
        trialDays = this.configService.trialDays;
        const startAt = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60);
        subscriptionPayload.start_at = startAt;
      }

      const rzp = this.getRazorpay();
      const subscription = await rzp.subscriptions.create(subscriptionPayload);
      this.logger.log(`Created Razorpay subscription: ${subscription.id} for plan: ${planId} (trial: ${trialDays} days)`);

      const renewalTime = (subscription.current_end || (Date.now() / 1000 + 30 * 24 * 60 * 60)) * 1000;
      let finalRenewalTime = new Date(renewalTime);

      const customerUpdate: any = {
        razorpaySubscriptionId: subscription.id,
        subscriptionStatus: 'created',
        plan: planId,
        billingCycle,
        billingCountry: countryCode,
        currency: localizedPrice.currency,
        updatedAt: new Date(),
      };

      if (isTrialEligible) {
        trialStartDate = new Date();
        trialEndDate = new Date(Date.now() + (trialDays * 24 * 60 * 60 * 1000));
        customerUpdate.trialStartDate = trialStartDate;
        customerUpdate.trialEndDate = trialEndDate;
        customerUpdate.trialUsed = true;
        customerUpdate.renewalDate = trialEndDate;
        finalRenewalTime = trialEndDate;
      } else {
        customerUpdate.renewalDate = finalRenewalTime;
      }

      await db.collection('customers').doc(customerId).set(customerUpdate, { merge: true });

      if (process.env.DATABASE_URL) {
        try {
          await this.prismaService.subscription.upsert({
            where: { id: subscription.id },
            update: {
              planId,
              billingCycle,
              status: 'created',
              currency: localizedPrice.currency,
              renewalDate: finalRenewalTime,
              trialStartDate,
              trialEndDate,
            },
            create: {
              id: subscription.id,
              customerId,
              planId,
              billingCycle,
              status: 'created',
              currency: localizedPrice.currency,
              renewalDate: finalRenewalTime,
              trialStartDate,
              trialEndDate,
            },
          });
        } catch (err: any) {
          this.logger.error(`Prisma createSubscription sync failed: ${err.message}`);
        }
      }

      return {
        ...subscription,
        razorpayKeyId: this.configService.razorpayKeyId,
      };
    } catch (error: any) {
      this.logger.error(`Error creating subscription: ${error.message}`);
      throw error;
    }
  }

  async verifyPayment(paymentId: string, signature: string, subscriptionId: string, customerId?: string) {
    try {
      if (!paymentId || !signature || !subscriptionId) {
        throw new Error('Missing paymentId, signature, or subscriptionId');
      }

      const secret = this.configService.razorpayKeySecret;
      if (!secret) {
        throw new Error('Razorpay API key secret is not configured on the server.');
      }

      const crypto = require('crypto');
      const generatedSignature = crypto.createHmac('sha256', secret)
        .update(paymentId + '|' + subscriptionId)
        .digest('hex');

      if (generatedSignature !== signature) {
        throw new Error('Invalid signature');
      }

      if (process.env.DATABASE_URL && customerId) {
        try {
          await this.prismaService.payment.upsert({
            where: { id: paymentId },
            update: {
              status: 'captured',
            },
            create: {
              id: paymentId,
              customerId,
              subscriptionId,
              paymentId,
              amount: 0,
              currency: 'INR',
              status: 'captured',
            },
          });
        } catch (err: any) {
          this.logger.error(`Prisma verifyPayment sync failed: ${err.message}`);
        }
      }

      return true;
    } catch (error: any) {
      this.logger.error(`Error verifying payment signature: ${error.message}`);
      throw error;
    }
  }
}
