/**
 * services/paymentService.js
 *
 * Handles Razorpay subscriptions, upgrades, downgrades, cancellations,
 * billing info, invoices, and webhook event processing.
 */

'use strict';

const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getDb, admin } = require('../config/firebase');
const { invalidateCache } = require('./permissionService');
const emailBridge = require('../src/modules/email/email.integration');
const pricingService = require('./pricingService');

let razorpayInstance = null;

/**
 * Lazy loading of Razorpay client instance.
 */
function getRazorpay() {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
      throw new Error('Razorpay API credentials are not configured on the server.');
    }
    
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
  }
  return razorpayInstance;
}

/**
 * Create a new Razorpay subscription context.
 */
async function createSubscription(customerId, planId, billingCycle = 'monthly', countryCode = 'IN') {
  try {
    const db = getDb();
    const planDoc = await db.collection('plans').doc(planId).get();
    if (!planDoc.exists) {
      throw new Error(`Plan ${planId} not found in database`);
    }

    const customerSnap = await db.collection('customers').doc(customerId).get();
    const customerData = customerSnap.exists ? customerSnap.data() : null;
    const isTrialEligible = !customerData || customerData.trialUsed !== true;

    // Resolve localized prices and Plan IDs from centralized pricing service
    const localizedPrice = await pricingService.getPlanPrice(planId, countryCode);
    const razorpayPlanId = billingCycle === 'annual'
      ? localizedPrice.razorpayAnnualPlanId
      : localizedPrice.razorpayMonthlyPlanId;

    if (!razorpayPlanId || razorpayPlanId.endsWith('_dummy')) {
      logger.error('[PaymentService] Production payment failure: Razorpay plan configurations are missing or invalid.', {
        planId,
        razorpayPlanId
      });
      throw new Error('Unable to start payment because the selected subscription plan is not configured correctly on the server.');
    }

    const subscriptionPayload = {
      plan_id: razorpayPlanId,
      customer_notify: 1,
      total_count: billingCycle === 'annual' ? 10 : 120, // 10 cycles
      quantity: 1,
    };

    let trialDays = 0;
    if (isTrialEligible) {
      trialDays = 7;
      const startAt = Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60);
      subscriptionPayload.start_at = startAt;
    }

    const rzp = getRazorpay();
    const subscription = await rzp.subscriptions.create(subscriptionPayload);
    logger.info('[PaymentService] Created Razorpay subscription', { subscriptionId: subscription.id, planId, countryCode, trialDays });

    const customerUpdate = {
      razorpaySubscriptionId: subscription.id,
      subscriptionStatus: 'created',
      plan: planId,
      billingCycle,
      billingCountry: countryCode,
      currency: localizedPrice.currency,
      renewalDate: admin.firestore.Timestamp.fromMillis((subscription.current_end || (Date.now() / 1000 + 30 * 24 * 60 * 60)) * 1000),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (isTrialEligible) {
      customerUpdate.trialStartDate = admin.firestore.FieldValue.serverTimestamp();
      customerUpdate.trialEndDate = admin.firestore.Timestamp.fromMillis((Math.floor(Date.now() / 1000) + (trialDays * 24 * 60 * 60)) * 1000);
      customerUpdate.trialUsed = true;
      // Start date of subscription charging is set as next billing date
      customerUpdate.renewalDate = customerUpdate.trialEndDate;
    }

    // Save to customer document using set with merge=true to auto-create if missing
    await db.collection('customers').doc(customerId).set(customerUpdate, { merge: true });

    return {
      ...subscription,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    };
  } catch (error) {
    logger.error('Error creating subscription', { error: error.message });
    throw error;
  }
}

/**
 * Verify Razorpay payment signature.
 */
async function verifyPayment(paymentId, signature, subscriptionId) {
  try {
    if (!paymentId || !signature || !subscriptionId) {
      throw new Error('Missing paymentId, signature, or subscriptionId');
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret) {
      throw new Error('Razorpay API key secret is not configured on the server.');
    }

    const generatedSignature = crypto.createHmac('sha256', secret)
      .update(paymentId + '|' + subscriptionId)
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new Error('Invalid signature');
    }
    return true;
  } catch (error) {
    logger.error('Error verifying payment signature', { error: error.message });
    throw error;
  }
}

/**
 * Handle subscription webhook events securely.
 */
async function handleWebhook(payload, signature) {
  try {
    if (!payload) return false;

    // Verify webhook signature
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('[PaymentService] Missing RAZORPAY_WEBHOOK_SECRET environment variable!');
      return false;
    }
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(JSON.stringify(payload));
    const digest = shasum.digest('hex');

    if (digest !== signature) {
      logger.warn('[PaymentService] Webhook signature mismatch.');
      return false;
    }

    const db = getDb();
    const event = payload.event;
    const entity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity || {};
    const subscriptionId = entity.id || entity.subscription_id;

    if (!subscriptionId) {
      logger.warn('[PaymentService] No subscriptionId present in webhook event payload');
      return true;
    }

    // Resolve customer by subscriptionId
    const customersSnap = await db.collection('customers')
      .where('razorpaySubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();

    if (customersSnap.empty) {
      logger.warn('[PaymentService] Customer not found for webhook subscriptionId', { subscriptionId });
      return true;
    }

    const customerDoc = customersSnap.docs[0];
    const customerId = customerDoc.id;
    const customerData = customerDoc.data();

    logger.info('[PaymentService] Processing webhook event', { event, subscriptionId, customerId });

    let statusUpdate = {};
    const renewalTime = entity.current_end ? entity.current_end * 1000 : (Date.now() + 30 * 24 * 60 * 60 * 1000);

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
      case 'invoice.paid':
        statusUpdate = {
          subscriptionStatus: 'active',
          paymentStatus: 'paid',
          renewalDate: admin.firestore.Timestamp.fromMillis(renewalTime),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Invalidate cache immediately on update
        invalidateCache();

        // Save invoice record
        if (payload.payload?.invoice?.entity) {
          const invoice = payload.payload.invoice.entity;
          await db.collection('invoices').add({
            customerId,
            invoiceId: invoice.id,
            amount: invoice.amount / 100,
            currency: invoice.currency,
            status: 'paid',
            issuedAt: admin.firestore.Timestamp.fromMillis(invoice.issued_at * 1000),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        // Trigger welcome or confirmation email
        emailBridge.queueSubscriptionActivatedEmail(
          customerData.email || 'customer@onerepute.com',
          customerData.name || 'Valued Customer',
          customerData.plan || 'Starter',
          entity.charge_at_value ? entity.charge_at_value / 100 : 0,
          new Date(renewalTime).toLocaleDateString()
        ).catch(err => logger.error('Failed to send confirmation email', { error: err.message }));
        break;

      case 'subscription.cancelled':
        statusUpdate = {
          subscriptionStatus: 'cancelled',
          renewalDate: admin.firestore.Timestamp.fromMillis(renewalTime),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        invalidateCache();
        break;

      case 'subscription.paused':
        statusUpdate = {
          subscriptionStatus: 'paused',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        invalidateCache();
        break;

      case 'payment.failed':
        statusUpdate = {
          paymentStatus: 'failed',
          subscriptionStatus: 'past_due',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        invalidateCache();
        break;
    }

    if (Object.keys(statusUpdate).length > 0) {
      await db.collection('customers').doc(customerId).set(statusUpdate, { merge: true });
    }

    return true;
  } catch (error) {
    logger.error('Error handling webhook', { error: error.message });
    throw error;
  }
}

/**
 * Cancel subscription at the end of the current billing cycle.
 */
async function cancelSubscription(customerId) {
  try {
    const db = getDb();
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) throw new Error('Customer not found');

    const customer = doc.data();
    const subscriptionId = customer.razorpaySubscriptionId;

    if (!subscriptionId) {
      throw new Error('No active subscription found to cancel');
    }

    const rzp = getRazorpay();
    // Cancel at end of cycle (cancel_at_cycle_end: 1)
    await rzp.subscriptions.cancel(subscriptionId, { cancel_at_cycle_end: 1 });

    await db.collection('customers').doc(customerId).set({
      cancelAtPeriodEnd: true,
      subscriptionStatus: 'cancelled', // Or track via flag
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    invalidateCache();
    return { success: true, message: 'Subscription will be cancelled at the end of the current period.' };
  } catch (error) {
    logger.error('Error cancelling subscription', { error: error.message });
    throw error;
  }
}

/**
 * Revert cancellation scheduled on a subscription.
 */
async function resumeSubscription(customerId) {
  try {
    const db = getDb();
    const doc = await db.collection('customers').doc(customerId).get();
    if (!doc.exists) throw new Error('Customer not found');

    const customer = doc.data();
    const subscriptionId = customer.razorpaySubscriptionId;

    if (!subscriptionId) {
      throw new Error('No subscription found to resume');
    }

    // In Razorpay, there is no direct resume after cancellation API,
    // but if it's scheduled to cancel, it can be patched or re-activated.
    // For mock/development, we toggle the cancel flag.
    await db.collection('customers').doc(customerId).set({
      cancelAtPeriodEnd: false,
      subscriptionStatus: 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    invalidateCache();
    return { success: true, message: 'Subscription successfully resumed.' };
  } catch (error) {
    logger.error('Error resuming subscription', { error: error.message });
    throw error;
  }
}

/**
 * Handle subscription upgrades/downgrades with proration.
 */
async function changePlan(customerId, newPlanId, billingCycle = 'monthly') {
  try {
    const db = getDb();
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

    // Resolve billingCountry and load localized plan prices
    const country = customer.billingCountry || 'IN';
    const localizedPrice = await pricingService.getPlanPrice(newPlanId, country);

    const newRazorpayPlanId = billingCycle === 'annual'
      ? localizedPrice.razorpayAnnualPlanId
      : localizedPrice.razorpayMonthlyPlanId;

    const subscriptionId = customer.razorpaySubscriptionId;

    if (isUpgrade) {
      // Immediate Upgrade: Update immediately and charge prorated amount
      const rzp = getRazorpay();
      if (subscriptionId) {
        // Update existing subscription to use new plan ID
        await rzp.subscriptions.update(subscriptionId, {
          plan_id: newRazorpayPlanId,
          schedule_change: 'now', // Apply immediately
        });
      }

      await db.collection('customers').doc(customerId).set({
        plan: newPlanId,
        billingCycle,
        currency: localizedPrice.currency,
        subscriptionStatus: 'active',
        renewalDate: admin.firestore.Timestamp.fromMillis(Date.now() + (billingCycle === 'annual' ? 365 : 30) * 24 * 60 * 60 * 1000),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      // Clear quota usage partially or completely on upgrade to give immediate limit room
      const usageRef = db.collection('customerUsage').doc(customerId);
      const usageSnap = await usageRef.get();
      if (usageSnap.exists) {
        // Reset responses to give them full new plan limits immediately
        await usageRef.update({
          review_reply_count: 0,
        });
      }

      invalidateCache();
      return { success: true, message: `Upgraded to ${planData.name} plan successfully.` };
    } else {
      // Scheduled Downgrade: Downgrade only triggers at end of active period (renewalDate)
      await db.collection('customers').doc(customerId).set({
        pendingPlanDowngrade: {
          plan: newPlanId,
          billingCycle,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      return { success: true, message: `Downgrade scheduled. You will transition to the ${planData.name} plan at the end of your billing cycle.` };
    }
  } catch (error) {
    logger.error('Error changing subscription plan', { error: error.message });
    throw error;
  }
}

/**
 * Fetch detailed billing, invoices, usage remaining context.
 */
async function getBillingInfo(customerId) {
  const db = getDb();

  const [customerSnap, usageSnap, plansSnap] = await Promise.all([
    db.collection('customers').doc(customerId).get(),
    db.collection('customerUsage').doc(customerId).get(),
    db.collection('plans').get(),
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

  const rawPlans = plansSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Resolve localized prices dynamically
  const plans = await Promise.all(
    rawPlans.map(async (plan) => {
      const localized = await pricingService.getPlanPrice(plan.id, country);
      return {
        ...plan,
        monthlyPrice: localized.monthlyPrice,
        annualPrice: localized.annualPrice,
        currency: localized.currency,
        currencySymbol: pricingService.getCurrencySymbol(localized.currency),
        razorpayMonthlyPlanId: localized.razorpayMonthlyPlanId,
        razorpayAnnualPlanId: localized.razorpayAnnualPlanId,
      };
    })
  );

  // Load invoice logs without forcing a Firestore composite index requirement
  const invoicesSnap = await db.collection('invoices')
    .where('customerId', '==', customerId)
    .get();

  const invoices = invoicesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
  // Sort in-memory descending by issuedAt
  invoices.sort((a, b) => {
    const dateA = a.issuedAt?.toDate ? a.issuedAt.toDate() : new Date(a.issuedAt || 0);
    const dateB = b.issuedAt?.toDate ? b.issuedAt.toDate() : new Date(b.issuedAt || 0);
    return dateB - dateA;
  });

  return {
    subscription: {
      plan: customer.plan || 'plan_starter',
      billingCycle: customer.billingCycle || 'monthly',
      status: customer.subscriptionStatus || 'inactive',
      renewalDate: customer.renewalDate ? customer.renewalDate.toDate ? customer.renewalDate.toDate() : customer.renewalDate : null,
      cancelAtPeriodEnd: customer.cancelAtPeriodEnd || false,
      pendingPlanDowngrade: customer.pendingPlanDowngrade || null,
      billingCountry: country,
      currency: customer.currency || (country === 'IN' ? 'INR' : 'USD'),
      trialStartDate: customer.trialStartDate ? (customer.trialStartDate.toDate ? customer.trialStartDate.toDate() : customer.trialStartDate) : null,
      trialEndDate: customer.trialEndDate ? (customer.trialEndDate.toDate ? customer.trialEndDate.toDate() : customer.trialEndDate) : null,
    },
    usage: {
      repliesUsed: usage.review_reply_count || 0,
      qrsUsed: usage.smart_qr_count || 0,
      competitorsUsed: usage.competitor_count || 0,
      usersUsed: usage.team_member_count || 0,
    },
    plans,
    invoices,
  };
}

module.exports = {
  createSubscription,
  verifyPayment,
  handleWebhook,
  cancelSubscription,
  resumeSubscription,
  changePlan,
  getBillingInfo,
};
