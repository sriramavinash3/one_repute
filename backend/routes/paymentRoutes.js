'use strict';

const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const { getDb } = require('../config/firebase');
const { verifyToken } = require('../middleware/auth');

const pricingService = require('../services/pricingService');

/**
 * GET /api/payments/detect-location
 * Detects the user's localized country and default currency parameters.
 */
router.get('/detect-location', async (req, res) => {
  try {
    let customerData = null;
    let userData = null;
    let outletData = null;

    // Check optional bearer token
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const idToken = authHeader.split('Bearer ')[1];
        const { admin: firebaseAdmin } = require('../config/firebase');
        const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
        const db = getDb();
        
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (userDoc.exists) {
          userData = userDoc.data();
          if (userData.customerId) {
            const customerDoc = await db.collection('customers').doc(userData.customerId).get();
            if (customerDoc.exists) {
              customerData = customerDoc.data();
            }
          }
          if (userData.outletId) {
            const outletDoc = await db.collection('outlets').doc(userData.outletId).get();
            if (outletDoc.exists) {
              outletData = outletDoc.data();
            }
          }
        }
      } catch (e) {
        // ignore invalid token errors and fallback to IP detection
      }
    }

    const country = pricingService.detectCountry(req, customerData, userData, outletData);
    
    // Resolve prices for Starter plan to find currency symbol
    const starterPrice = await pricingService.getPlanPrice('plan_starter', country);

    res.status(200).json({
      country,
      currency: starterPrice.currency,
      symbol: pricingService.getCurrencySymbol(starterPrice.currency),
    });
  } catch (err) {
    logger.error('Failed to detect user country location', { error: err.message });
    res.status(200).json({ country: 'IN', currency: 'INR', symbol: '₹' }); // fallback defaults
  }
});
/**
 * POST /api/payments/create-subscription
 * Initiate Razorpay subscription payment context.
 */
router.post('/create-subscription', verifyToken, async (req, res) => {
  try {
    const { customerId, planId, billingCycle } = req.body;
    const resolvedCustomerId = customerId || req.user.customerId;
    if (!resolvedCustomerId || !planId) {
      return res.status(400).json({ error: 'customerId and planId are required' });
    }

    // Load profiles to perform location checks
    const db = getDb();
    const userDoc = await db.collection('users').doc(req.user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;
    let customerData = null;
    if (resolvedCustomerId) {
      const customerDoc = await db.collection('customers').doc(resolvedCustomerId).get();
      if (customerDoc.exists) customerData = customerDoc.data();
    }
    let outletData = null;
    if (userData && userData.outletId) {
      const outletDoc = await db.collection('outlets').doc(userData.outletId).get();
      if (outletDoc.exists) outletData = outletDoc.data();
    }

    const country = pricingService.detectCountry(req, customerData, userData, outletData);

    const subscription = await paymentService.createSubscription(resolvedCustomerId, planId, billingCycle, country);
    res.status(200).json(subscription);
  } catch (err) {
    logger.error('Failed to create subscription', { error: err.message });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

/**
 * POST /api/payments/verify
 * Verify payment signature.
 */
router.post('/verify', verifyToken, async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_signature, razorpay_subscription_id, customerId } = req.body;
    const resolvedCustomerId = customerId || req.user.customerId;
    const isValid = await paymentService.verifyPayment(razorpay_payment_id, razorpay_signature, razorpay_subscription_id);
    
    if (isValid) {
      const db = getDb();
      const customerDoc = await db.collection('customers').doc(resolvedCustomerId).get();
      const customerData = customerDoc.exists ? customerDoc.data() : {};
      const isTrialActive = customerData.trialEndDate && customerData.trialEndDate.toDate() > new Date();
      const status = isTrialActive ? 'trialing' : 'active';

      await db.collection('customers').doc(resolvedCustomerId).set({
        subscriptionStatus: status,
        razorpayPaymentId: razorpay_payment_id
      }, { merge: true });
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (err) {
    logger.error('Payment verification failed', { error: err.message });
    res.status(500).json({ error: 'Verification failed' });
  }
});

/**
 * GET /api/payments/billing-info
 * Fetch current subscription status, usage counters, and invoices.
 */
router.get('/billing-info', verifyToken, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer context missing' });
    }
    const billingInfo = await paymentService.getBillingInfo(customerId);
    res.status(200).json(billingInfo);
  } catch (err) {
    logger.error('Failed to fetch billing info', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve billing info' });
  }
});

/**
 * POST /api/payments/change-plan
 * Change customer plan (upgrades/downgrades).
 */
router.post('/change-plan', verifyToken, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const { newPlanId, billingCycle } = req.body;
    if (!customerId || !newPlanId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    const result = await paymentService.changePlan(customerId, newPlanId, billingCycle);
    res.status(200).json(result);
  } catch (err) {
    logger.error('Plan modification failed', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to modify subscription plan' });
  }
});

/**
 * POST /api/payments/cancel
 * Schedule subscription cancellation.
 */
router.post('/cancel', verifyToken, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer context missing' });
    }
    const result = await paymentService.cancelSubscription(customerId);
    res.status(200).json(result);
  } catch (err) {
    logger.error('Cancellation failed', { error: err.message });
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/payments/resume
 * Revert cancellation scheduled on a subscription.
 */
router.post('/resume', verifyToken, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer context missing' });
    }
    const result = await paymentService.resumeSubscription(customerId);
    res.status(200).json(result);
  } catch (err) {
    logger.error('Resume failed', { error: err.message });
    res.status(500).json({ error: 'Failed to resume subscription' });
  }
});

/**
 * POST /api/payments/webhook
 * Unauthenticated webhooks verification endpoint.
 */
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const payload = req.body;
    
    const processed = await paymentService.handleWebhook(payload, signature);
    if (processed) {
      res.status(200).send('OK');
    } else {
      res.status(400).send('Invalid signature');
    }
  } catch (err) {
    logger.error('Webhook ingestion failed', { error: err.message });
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
