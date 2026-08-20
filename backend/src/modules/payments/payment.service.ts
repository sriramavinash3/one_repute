import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanService } from './plan.service';
import { PaymentsConfigService } from './payments-config.service';
import { EmailService } from '../email/services/email.service';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private razorpayInstance: any = null;

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly planService: PlanService,
    private readonly configService: PaymentsConfigService,
    private readonly emailService: EmailService,
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

  async createSubscription(customerId: string, rawPlanId: string, billingCycle: string = 'monthly', countryCode: string = 'IN', discountCode?: string, skipTrial: boolean = true) {
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
      const basePriceAmount = billingCycle === 'annual' 
        ? localizedPrice.annualPrice 
        : billingCycle === 'quarterly' 
        ? localizedPrice.quarterlyPrice 
        : localizedPrice.monthlyPrice;

      if (!basePriceAmount || basePriceAmount <= 0) {
        throw new Error(`Invalid price configured for plan ${planId} (${billingCycle})`);
      }

      let priceAmount = basePriceAmount;
      if (discountCode) {
        try {
          const discountSnap = await db.collection('discounts')
            .where('code', '==', discountCode.toUpperCase())
            .limit(1)
            .get();
          if (!discountSnap.empty) {
            const disc = discountSnap.docs[0].data();
            if (disc.status === 'Active' || disc.status === 'active') {
              if (disc.type === 'percentage' || disc.type === 'Percentage') {
                priceAmount = Math.max(1, basePriceAmount * (1 - disc.value / 100));
              } else if (disc.type === 'flat' || disc.type === 'Flat') {
                priceAmount = Math.max(1, basePriceAmount - disc.value);
              }
            }
          }
        } catch (e: any) {
          this.logger.warn(`Failed to validate discount code ${discountCode}: ${e.message}`);
        }
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

      // Only attach future start_at if user explicitly requested deferred trial billing
      if (!skipTrial) {
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
      }

      const subscription = await rzp.subscriptions.create(subscriptionPayload);

      // Requirement 9: Important Debugging Logs
      this.logger.log(`====================================================`);
      this.logger.log(`[CHECKOUT DEBUG] Selected plan ID: ${planId}`);
      this.logger.log(`[CHECKOUT DEBUG] Plan name: ${validPlan.name}`);
      this.logger.log(`[CHECKOUT DEBUG] Base plan price: ${basePriceAmount}`);
      this.logger.log(`[CHECKOUT DEBUG] Effective price amount: ${priceAmount}`);
      this.logger.log(`[CHECKOUT DEBUG] Currency: ${localizedPrice.currency || 'INR'}`);
      this.logger.log(`[CHECKOUT DEBUG] Calculated amount in paise: ${priceAmountInPaise}`);
      this.logger.log(`[CHECKOUT DEBUG] Razorpay subscription ID: ${subscription.id}`);
      this.logger.log(`[CHECKOUT DEBUG] Razorpay plan ID: ${razorpayPlanId}`);
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

        // Dispatch Subscription Confirmation Email safely
        const recipientEmail = custData.email || custData.userEmail;
        if (recipientEmail) {
          const formattedPlanName = (targetPlan || 'growth').replace('plan_', '').toUpperCase();
          const amountPaidStr = `${localizedPrice.currency || 'INR'} ${calculatedAmount} / ${billingCycle}`;
          const formattedRenewalDate = renewalDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

          this.emailService.sendSubscriptionActivated({
            recipientEmail,
            userName: custData.name || recipientEmail.split('@')[0],
            planName: formattedPlanName,
            amountPaid: amountPaidStr,
            renewalDate: formattedRenewalDate,
            idempotencyKey: `sub_act_${subscriptionId}`,
          }).catch((emailErr) => {
            this.logger.warn(`Could not dispatch Subscription Confirmation email for ${recipientEmail}: ${emailErr.message}`);
          });
        }
      }

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Error verifying payment signature: ${error.message}`);
      throw error;
    }
  }

  async verifyAndProvisionOutlet(
    userUid: string,
    userEmail: string,
    dto: {
      razorpay_payment_id?: string;
      razorpay_signature?: string;
      razorpay_subscription_id?: string;
      planId: string;
      location: any;
      isTrial?: boolean;
    }
  ) {
    const { razorpay_payment_id, razorpay_signature, razorpay_subscription_id, planId, location, isTrial } = dto;
    if (!userUid || !userEmail) {
      throw new Error('User context is required');
    }
    if (!location || (!location.id && !location.placeId)) {
      throw new Error('Valid location data is required');
    }

    const db = this.firebaseService.getDb();
    const locationId = String(location.id || location.placeId || '').trim();

    // 1. If paid (not trial), verify Razorpay payment server-side
    if (!isTrial) {
      if (!razorpay_payment_id || !razorpay_signature || !razorpay_subscription_id) {
        throw new Error('Missing payment verification parameters');
      }
      const secret = this.configService.razorpayKeySecret;
      if (secret) {
        const crypto = require('crypto');
        const generatedSignature = crypto.createHmac('sha256', secret)
          .update(razorpay_payment_id + '|' + razorpay_subscription_id)
          .digest('hex');

        if (generatedSignature !== razorpay_signature) {
          this.logger.error(`[PROVISION OUTLET FAILED] Invalid payment signature for ${locationId}`);
          throw new Error('Server-side payment verification failed: Invalid signature');
        }
      }
    }

    // 2. Check server-side uniqueness to prevent duplicate outlet creation
    let existingSnap = await db.collection('outlets')
      .where('googleLocationId', '==', locationId)
      .limit(1)
      .get();

    if (existingSnap.empty && locationId) {
      const docSnap = await db.collection('outlets').doc(locationId).get();
      if (docSnap.exists) {
        existingSnap = { empty: false, docs: [docSnap] } as any;
      }
    }

    const now = new Date();
    const trialDays = this.configService.trialDays || 15;
    const trialStartDate = now;
    const trialEndDate = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const userDoc = await db.collection('users').doc(userUid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    let customerId = userData?.customerId;

    if (!customerId) {
      const customerRef = db.collection('customers').doc();
      customerId = customerRef.id;
    }

    const customerUpdate: any = {
      name: location.name || userEmail,
      email: userEmail,
      plan: planId || 'plan_starter',
      subscriptionStatus: isTrial ? 'trialing' : 'active',
      updatedAt: now,
    };
    if (isTrial) {
      customerUpdate.trialStartDate = trialStartDate;
      customerUpdate.trialEndDate = trialEndDate;
      customerUpdate.trialUsed = true;
    }
    await db.collection('customers').doc(customerId).set(customerUpdate, { merge: true });

    let targetOutletId: string;
    let alreadyExisted = false;

    if (!existingSnap.empty) {
      const existingDoc = existingSnap.docs[0];
      targetOutletId = existingDoc.id;
      alreadyExisted = true;

      const outletUpdatePayload: any = {
        status: 'active',
        isActive: true,
        planId: planId || 'plan_starter',
        updatedAt: now,
      };
      if (isTrial) {
        outletUpdatePayload.subscriptionStatus = 'trialing';
        outletUpdatePayload.isTrial = true;
        outletUpdatePayload.trialStartDate = trialStartDate;
        outletUpdatePayload.trialEndDate = trialEndDate;
      }

      await db.collection('outlets').doc(targetOutletId).set(outletUpdatePayload, { merge: true });

      this.logger.log(`[PROVISION OUTLET] Outlet ${targetOutletId} already existed for locationId ${locationId}. Updated trial & plan status.`);
    } else {
      const newOutletRef = db.collection('outlets').doc();
      targetOutletId = newOutletRef.id;

      const businessName = location.name || 'Business Outlet';
      const businessCategory = location.category || location.primaryCategory?.displayName || 'General Business';
      const address = location.address || (location.addressLines ? location.addressLines.join(', ') : '');

      const newOutletPayload: any = {
        name: businessName,
        businessType: businessCategory,
        businessCategory: businessCategory,
        address: address,
        placeId: location.placeId || locationId,
        providerType: 'GBP',
        googleLocationId: locationId,
        googleLocationName: businessName,
        googleLocationAddress: address,
        googleAccountId: location.accountId || userData?.googleAccountId || '',
        googleRefreshToken: userData?.googleRefreshToken || null,
        googleAccountEmail: userData?.googleAccountEmail || userEmail,
        googleLocations: [location],
        googleConnectedAt: now,
        ownerId: userUid,
        customerId: customerId,
        email: userEmail,
        isActive: true,
        status: 'active',
        planId: planId || 'plan_starter',
        reviewsCount: 0,
        averageRating: 5.0,
        createdAt: now,
        updatedAt: now,
      };

      if (isTrial) {
        newOutletPayload.subscriptionStatus = 'trialing';
        newOutletPayload.isTrial = true;
        newOutletPayload.trialStartDate = trialStartDate;
        newOutletPayload.trialEndDate = trialEndDate;
      }

      await newOutletRef.set(newOutletPayload);

      this.logger.log(`[PROVISION OUTLET] Provisioned new outlet ${targetOutletId} for locationId ${locationId}`);

      try {
        const recipientEmail = userEmail || userData?.email;
        if (recipientEmail) {
          const userName = recipientEmail.split('@')[0] || businessName;
          await this.emailService.sendOutletGreeting({
            outletId: targetOutletId,
            recipientEmail: recipientEmail,
            userName,
            businessName,
            planName: planId || 'Starter',
            isTrial: Boolean(isTrial),
            userId: userUid,
            idempotencyKey: `outlet_greeting_${targetOutletId}`,
          });
          this.logger.log(`[PROVISION OUTLET] Outlet greeting email queued for ${recipientEmail} (outletId=${targetOutletId})`);
        }
      } catch (emailErr: any) {
        this.logger.warn(`[PROVISION OUTLET] Could not send outlet greeting email for outlet ${targetOutletId}: ${emailErr.message}`);
      }
    }

    // Always update user document to set current active outletId
    await db.collection('users').doc(userUid).set({
      outletId: targetOutletId,
      customerId: customerId,
      isSetupComplete: true,
      role: 'outlet',
      updatedAt: now,
    }, { merge: true });

    return {
      success: true,
      outletId: targetOutletId,
      alreadyExisted,
      status: isTrial ? 'trialing' : 'active',
      planId: planId || 'plan_starter',
    };
  }
}

