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

  async createSubscription(customerId: string, rawPlanId: string, billingCycle: string = 'monthly', countryCode: string = 'IN') {
    try {
      if (!rawPlanId) {
        throw new Error('Plan ID is required for checkout.');
      }

      const planId = rawPlanId.startsWith('plan_') ? rawPlanId : `plan_${rawPlanId}`;
      const centralPlans = this.planService.CentralPlanDefinitions;
      const validPlan = centralPlans.find(p => p.id === planId);
      if (!validPlan) {
        throw new Error(`Invalid or non-existent plan selected: ${rawPlanId}`);
      }

      const db = this.firebaseService.getDb();
      
      const customerSnap = await db.collection('customers').doc(customerId).get();
      const customerData = customerSnap.exists ? customerSnap.data() : null;

      const now = new Date();
      let trialStartDate: Date | null = null;
      let trialEndDate: Date | null = null;
      let isCurrentlyInTrial = false;

      if (customerData?.trialEndDate) {
        const rawTrialEnd = customerData.trialEndDate.toDate ? customerData.trialEndDate.toDate() : new Date(customerData.trialEndDate);
        if (rawTrialEnd.getTime() > now.getTime()) {
          isCurrentlyInTrial = true;
          trialEndDate = rawTrialEnd;
          if (customerData.trialStartDate) {
            trialStartDate = customerData.trialStartDate.toDate ? customerData.trialStartDate.toDate() : new Date(customerData.trialStartDate);
          }
        }
      }

      const isNewTrialEligible = (!customerData || customerData.trialUsed !== true) && !isCurrentlyInTrial;

      const localizedPrice = await this.planService.getPlanPrice(planId, countryCode);
      const priceAmount = billingCycle === 'annual' 
        ? localizedPrice.annualPrice 
        : billingCycle === 'quarterly' 
        ? localizedPrice.quarterlyPrice 
        : localizedPrice.monthlyPrice;

      if (!priceAmount || priceAmount <= 0) {
        throw new Error(`Invalid price configured for plan ${planId} (${billingCycle})`);
      }

      const priceAmountInPaise = Math.round(priceAmount * 100);

      const rzp = this.getRazorpay();

      // Ensure dynamic Razorpay plan with exact server-calculated amount in paise
      const razorpayPlanId = await this.planService.ensureRazorpayPlan(
        rzp,
        planId,
        billingCycle,
        priceAmount,
        localizedPrice.currency || 'INR'
      );

      const subscriptionPayload: any = {
        plan_id: razorpayPlanId,
        customer_notify: 1,
        total_count: billingCycle === 'annual' ? 10 : billingCycle === 'quarterly' ? 40 : 120,
        quantity: 1,
      };

      if (isCurrentlyInTrial && trialEndDate) {
        const startAt = Math.floor(trialEndDate.getTime() / 1000);
        if (startAt > Math.floor(Date.now() / 1000) + 300) {
          subscriptionPayload.start_at = startAt;
        }
      } else if (isNewTrialEligible) {
        trialStartDate = new Date();
        trialEndDate = new Date(Date.now() + (this.configService.trialDays * 24 * 60 * 60 * 1000));
        const startAt = Math.floor(trialEndDate.getTime() / 1000);
        subscriptionPayload.start_at = startAt;
      }

      const subscription = await rzp.subscriptions.create(subscriptionPayload);

      // Requirement 9: Important Debugging Logs
      this.logger.log(`====================================================`);
      this.logger.log(`[CHECKOUT DEBUG] Selected plan ID: ${planId}`);
      this.logger.log(`[CHECKOUT DEBUG] Plan name: ${validPlan.name}`);
      this.logger.log(`[CHECKOUT DEBUG] Database/configured plan price: ${priceAmount}`);
      this.logger.log(`[CHECKOUT DEBUG] Calculated amount in INR: ${priceAmount}`);
      this.logger.log(`[CHECKOUT DEBUG] Calculated amount in paise: ${priceAmountInPaise}`);
      this.logger.log(`[CHECKOUT DEBUG] Razorpay order ID: ${subscription.id}`);
      this.logger.log(`[CHECKOUT DEBUG] Razorpay order amount: ${priceAmountInPaise} paise`);
      this.logger.log(`====================================================`);

      const daysToAdd = billingCycle === 'annual' ? 365 : billingCycle === 'quarterly' ? 90 : 30;
      let finalRenewalTime: Date;

      if (isCurrentlyInTrial && trialEndDate) {
        finalRenewalTime = new Date(trialEndDate.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
      } else {
        const renewalTime = (subscription.current_end || (Date.now() / 1000 + daysToAdd * 24 * 60 * 60)) * 1000;
        finalRenewalTime = new Date(renewalTime);
      }

      const customerUpdate: any = {
        razorpaySubscriptionId: subscription.id,
        subscriptionStatus: isCurrentlyInTrial ? 'trialing' : 'created',
        scheduledPlan: planId,
        scheduledBillingCycle: billingCycle,
        billingCountry: countryCode,
        currency: localizedPrice.currency,
        updatedAt: new Date(),
      };

      if (!isCurrentlyInTrial && isNewTrialEligible) {
        customerUpdate.trialStartDate = trialStartDate;
        customerUpdate.trialEndDate = trialEndDate;
        customerUpdate.trialUsed = true;
        customerUpdate.renewalDate = trialEndDate;
        finalRenewalTime = trialEndDate!;
      } else if (!isCurrentlyInTrial) {
        customerUpdate.plan = planId;
        customerUpdate.billingCycle = billingCycle;
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
              status: isCurrentlyInTrial ? 'trialing' : 'created',
              currency: localizedPrice.currency,
              renewalDate: finalRenewalTime,
              trialStartDate: isCurrentlyInTrial ? trialStartDate : (customerUpdate.trialStartDate || null),
              trialEndDate: isCurrentlyInTrial ? trialEndDate : (customerUpdate.trialEndDate || null),
            },
            create: {
              id: subscription.id,
              customerId,
              planId,
              billingCycle,
              status: isCurrentlyInTrial ? 'trialing' : 'created',
              currency: localizedPrice.currency,
              renewalDate: finalRenewalTime,
              trialStartDate: trialStartDate || null,
              trialEndDate: trialEndDate || null,
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
        this.logger.error(`[VERIFY PAYMENT FAILED] Invalid signature for payment ${paymentId}, subscription ${subscriptionId}`);
        throw new Error('Invalid signature');
      }

      const db = this.firebaseService.getDb();
      let targetCustomerId = customerId;

      if (!targetCustomerId) {
        const snap = await db.collection('customers')
          .where('razorpaySubscriptionId', '==', subscriptionId)
          .limit(1)
          .get();
        if (!snap.empty) {
          targetCustomerId = snap.docs[0].id;
        }
      }

      if (targetCustomerId) {
        const custDoc = await db.collection('customers').doc(targetCustomerId).get();
        const custData = custDoc.exists ? custDoc.data() : {};
        const billingCycle = custData.scheduledBillingCycle || custData.billingCycle || 'monthly';
        const daysToAdd = billingCycle === 'annual' ? 365 : billingCycle === 'quarterly' ? 90 : 30;
        
        const now = new Date();
        let existingTrialEnd: Date | null = null;
        if (custData.trialEndDate) {
          const t = custData.trialEndDate.toDate ? custData.trialEndDate.toDate() : new Date(custData.trialEndDate);
          if (t.getTime() > now.getTime()) {
            existingTrialEnd = t;
          }
        }

        const targetPlan = custData.scheduledPlan || custData.plan || 'plan_starter';
        const localizedPrice = await this.planService.getPlanPrice(targetPlan, custData.billingCountry || 'IN');
        const calculatedAmount = billingCycle === 'annual'
          ? localizedPrice.annualPrice
          : billingCycle === 'quarterly'
          ? localizedPrice.quarterlyPrice
          : localizedPrice.monthlyPrice;

        this.logger.log(`====================================================`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Payment ID: ${paymentId}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Subscription ID: ${subscriptionId}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Target Customer ID: ${targetCustomerId}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Target Plan: ${targetPlan}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Billing Cycle: ${billingCycle}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Expected Plan Price: ${calculatedAmount} ${localizedPrice.currency}`);
        this.logger.log(`[VERIFY PAYMENT DEBUG] Expected Amount in Paise: ${Math.round(calculatedAmount * 100)}`);
        this.logger.log(`====================================================`);

        const newStatus = existingTrialEnd ? 'trial_paid_scheduled' : 'active';
        const paidPlanStartDate = existingTrialEnd || now;
        const renewalDate = new Date(paidPlanStartDate.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));

        const updateData: any = {
          plan: targetPlan,
          subscriptionStatus: newStatus,
          paymentStatus: 'paid',
          hasConvertedToPaid: true,
          paidPlanScheduled: existingTrialEnd ? true : false,
          scheduledPlan: targetPlan,
          billingCycle,
          currency: localizedPrice.currency,
          paidPlanStartDate,
          renewalDate,
          razorpayPaymentId: paymentId,
          razorpaySubscriptionId: subscriptionId,
          updatedAt: new Date(),
        };

        if (custData.trialStartDate) {
          updateData.trialStartDate = custData.trialStartDate;
        }
        if (custData.trialEndDate) {
          updateData.trialEndDate = custData.trialEndDate;
        }

        await db.collection('customers').doc(targetCustomerId).set(updateData, { merge: true });

        // Update active outlets linked to this customer immediately with upgraded plan
        const outletsSnap = await db.collection('outlets').where('customerId', '==', targetCustomerId).get();
        if (!outletsSnap.empty) {
          const batch = db.batch();
          outletsSnap.docs.forEach(doc => {
            batch.update(doc.ref, { 
              planType: targetPlan, 
              updatedAt: new Date() 
            });
          });
          await batch.commit();
        }

        // Add invoice record with exact server-side calculated price
        await db.collection('invoices').add({
          customerId: targetCustomerId,
          invoiceId: `INV_${Date.now()}`,
          paymentId,
          subscriptionId,
          amount: calculatedAmount,
          currency: localizedPrice.currency,
          status: 'paid',
          issuedAt: new Date(),
          createdAt: new Date(),
        });


        if (process.env.DATABASE_URL) {
          try {
            await this.prismaService.subscription.upsert({
              where: { id: subscriptionId },
              update: {
                status: newStatus,
                renewalDate,
              },
              create: {
                id: subscriptionId,
                customerId: targetCustomerId,
                planId: targetPlan,
                billingCycle,
                status: newStatus,
                currency: custData.currency || 'INR',
                renewalDate,
              },
            });

            await this.prismaService.payment.upsert({
              where: { id: paymentId },
              update: { status: 'captured' },
              create: {
                id: paymentId,
                customerId: targetCustomerId,
                subscriptionId,
                paymentId,
                amount: 0,
                currency: custData.currency || 'INR',
                status: 'captured',
              },
            });
          } catch (err: any) {
            this.logger.error(`Prisma verifyPayment sync failed: ${err.message}`);
          }
        }
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Error verifying payment signature: ${error.message}`);
      throw error;
    }
  }
}
