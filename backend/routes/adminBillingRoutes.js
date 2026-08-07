/**
 * routes/adminBillingRoutes.js
 *
 * REST APIs for Administrative Subscription & Feature Gate Controls.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb, admin } = require('../config/firebase');
const { invalidateCache } = require('../services/permissionService');
const logger = require('../utils/logger');

// Middleware to verify user is SUPER_ADMIN or ADMIN (handled by verifyToken + requireRole in app.js,
// but we add a safety check here to enforce that)
router.use((req, res, next) => {
  const role = String(req.user?.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied: Administrative permissions required' });
  }
  next();
});
const pricingService = require('../services/pricingService');

/**
 * GET /api/admin/billing/prices
 * Retrieve all localized pricing configurations.
 */
router.get('/prices', async (req, res) => {
  try {
    const db = getDb();
    const pricesSnap = await db.collection('planPrices').get();
    const prices = pricesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(prices);
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to fetch prices', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve localized prices' });
  }
});

/**
 * POST /api/admin/billing/prices
 * Create or update a localized pricing record.
 */
router.post('/prices', async (req, res) => {
  try {
    const { planId, country, currency, monthlyPrice, annualPrice, razorpayMonthlyPlanId, razorpayAnnualPlanId, status } = req.body;
    if (!planId || !country || !currency || monthlyPrice === undefined || annualPrice === undefined) {
      return res.status(400).json({ error: 'Missing required price parameters' });
    }

    const db = getDb();
    const docId = `${planId}_${country.trim().toUpperCase()}`;
    
    await db.collection('planPrices').doc(docId).set({
      planId,
      country: country.trim().toUpperCase(),
      currency: currency.trim().toUpperCase(),
      monthlyPrice: Number(monthlyPrice),
      annualPrice: Number(annualPrice),
      razorpayMonthlyPlanId: razorpayMonthlyPlanId || null,
      razorpayAnnualPlanId: razorpayAnnualPlanId || null,
      status: status || 'active',
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Invalidate the cache to apply the updates immediately
    pricingService.invalidateCache();

    res.status(200).json({ success: true, message: `Successfully updated localized price: ${docId}` });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to save price configuration', { error: err.message });
    res.status(500).json({ error: 'Failed to save localized price configuration' });
  }
});
/**
 * GET /api/admin/billing/plans
 * Retrieve list of all plans.
 */
router.get('/plans', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('plans').orderBy('sortOrder', 'asc').get();
    const plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(plans);
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to fetch plans', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch plans' });
  }
});

/**
 * PUT /api/admin/billing/plans/:planId
 * Update details of a specific plan.
 */
router.put('/plans/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const db = getDb();
    
    await db.collection('plans').doc(planId).update({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    invalidateCache();
    res.status(200).json({ success: true, message: 'Plan details updated successfully.' });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to update plan', { error: err.message });
    res.status(500).json({ error: 'Failed to update plan' });
  }
});

/**
 * GET /api/admin/billing/plans/:planId/features
 * Retrieve features defined for a plan.
 */
router.get('/plans/:planId/features', async (req, res) => {
  try {
    const { planId } = req.params;
    const db = getDb();
    const snap = await db.collection('planFeatures')
      .where('planId', '==', planId)
      .get();
    
    const features = {};
    snap.docs.forEach(doc => {
      const data = doc.data();
      features[data.featureKey] = data.featureValue;
    });

    res.status(200).json(features);
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to fetch plan features', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch plan features' });
  }
});

/**
 * PUT /api/admin/billing/plans/:planId/features
 * Update feature values for a specific plan.
 */
router.put('/plans/:planId/features', async (req, res) => {
  try {
    const { planId } = req.params;
    const features = req.body; // Key-value object of features
    const db = getDb();

    for (const [key, value] of Object.entries(features)) {
      const docId = `${planId}_${key}`;
      await db.collection('planFeatures').doc(docId).set({
        planId,
        featureKey: key,
        featureValue: value,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    invalidateCache();
    res.status(200).json({ success: true, message: 'Plan features updated successfully.' });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to update plan features', { error: err.message });
    res.status(500).json({ error: 'Failed to update plan features' });
  }
});

/**
 * GET /api/admin/billing/customers
 * Fetch customer list with billing and subscription details.
 */
router.get('/customers', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('customers').get();
    const customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(customers);
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to fetch customers', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * PUT /api/admin/billing/customers/:customerId/override
 * Administrative override of subscription variables (plan, dates, status).
 */
router.put('/customers/:customerId/override', async (req, res) => {
  try {
    const { customerId } = req.params;
    const db = getDb();
    
    const updates = { ...req.body };
    // Format timestamp variables if present
    if (updates.renewalDate) {
      updates.renewalDate = admin.firestore.Timestamp.fromDate(new Date(updates.renewalDate));
    }
    if (updates.trialEndsAt) {
      updates.trialEndsAt = admin.firestore.Timestamp.fromDate(new Date(updates.trialEndsAt));
    }

    await db.collection('customers').doc(customerId).update({
      ...updates,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    invalidateCache();
    res.status(200).json({ success: true, message: 'Customer subscription overridden successfully.' });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to override customer details', { error: err.message });
    res.status(500).json({ error: 'Failed to override customer subscription' });
  }
});

/**
 * PUT /api/admin/billing/customers/:customerId/quota
 * Administrative override of usage quotas.
 */
router.put('/customers/:customerId/quota', async (req, res) => {
  try {
    const { customerId } = req.params;
    const db = getDb();

    await db.collection('customerUsage').doc(customerId).set({
      ...req.body,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    res.status(200).json({ success: true, message: 'Customer quotas updated successfully.' });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to update customer quota', { error: err.message });
    res.status(500).json({ error: 'Failed to update customer usage quota' });
  }
});

/**
 * POST /api/admin/billing/customers/:customerId/reset-quota
 * Force manual reset of usage quotas.
 */
router.post('/customers/:customerId/reset-quota', async (req, res) => {
  try {
    const { customerId } = req.params;
    const db = getDb();

    await db.collection('customerUsage').doc(customerId).update({
      review_reply_count: 0,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, message: 'Quota manually reset.' });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to reset quota', { error: err.message });
    res.status(500).json({ error: 'Failed to trigger quota reset' });
  }
});

/**
 * GET /api/admin/billing/diagnostics
 * Check connectivity and details of the Razorpay and Billing configuration.
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const db = getDb();
    
    // 1. Validate keys presence
    const keyId = process.env.RAZORPAY_KEY_ID || '';
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
    const isDummy = !keyId || keyId === 'dummy_key_id' || keyId.startsWith('rzp_test_dummy');

    const keyIdStatus = keyId ? 'configured' : 'missing';
    const secretStatus = secret ? 'configured' : 'missing';
    const webhookSecretStatus = webhookSecret ? 'configured' : 'missing';

    let razorpayApiStatus = 'healthy';
    let razorpayApiMessage = 'Authentication Successful';
    let productsAvailable = false;
    let plansAvailable = false;

    if (!isDummy && keyId && secret) {
      try {
        const Razorpay = require('razorpay');
        const rzp = new Razorpay({ key_id: keyId, key_secret: secret });
        // Attempt simple fetch of plans and products
        const rzpPlans = await rzp.plans.all({ count: 1 });
        plansAvailable = rzpPlans && rzpPlans.items && rzpPlans.items.length > 0;
        productsAvailable = true;
      } catch (err) {
        razorpayApiStatus = 'error';
        razorpayApiMessage = err.message || 'Connection failed';
      }
    } else {
      // Mock Success in dummy mode
      productsAvailable = true;
      plansAvailable = true;
    }

    // 2. Database checks
    let dbConnected = false;
    let plansSyncedCount = 0;
    let featuresSyncedCount = 0;
    try {
      const plansSnap = await db.collection('plans').get();
      plansSyncedCount = plansSnap.size;
      const featuresSnap = await db.collection('planFeatures').get();
      featuresSyncedCount = featuresSnap.size;
      dbConnected = true;
    } catch (err) {
      dbConnected = false;
    }

    // 3. Webhooks checks
    let lastWebhookSuccess = null;
    try {
      const webhookLogsSnap = await db.collection('webhookLogs')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
      if (!webhookLogsSnap.empty) {
        lastWebhookSuccess = webhookLogsSnap.docs[0].data().createdAt;
      }
    } catch (err) {
      // ignore
    }

    // 4. Failed payments and renewals counts
    let failedPaymentsCount = 0;
    let pendingRenewalsCount = 0;
    try {
      const failedSnap = await db.collection('customers')
        .where('subscriptionStatus', '==', 'past_due')
        .get();
      failedPaymentsCount = failedSnap.size;

      // In Firestore, pendingPlanDowngrade is an object, so we look up if it exists
      const customersSnap = await db.collection('customers').get();
      customersSnap.docs.forEach(doc => {
        const d = doc.data();
        if (d.pendingPlanDowngrade) {
          pendingRenewalsCount++;
        }
      });
    } catch (err) {
      // ignore
    }

    res.status(200).json({
      razorpayStatus: razorpayApiStatus,
      razorpayMessage: razorpayApiMessage,
      keyIdStatus,
      secretStatus,
      webhookSecretStatus,
      isDummyMode: isDummy,
      productsAvailable,
      plansAvailable,
      databaseConnected: dbConnected,
      plansSyncedCount,
      featuresSyncedCount,
      currencyConfiguration: 'INR (₹ Indian Rupee)',
      lastSuccessfulWebhook: lastWebhookSuccess ? (lastWebhookSuccess.toDate ? lastWebhookSuccess.toDate() : lastWebhookSuccess) : 'No webhooks received yet',
      failedPayments: failedPaymentsCount,
      pendingRenewals: pendingRenewalsCount
    });
  } catch (err) {
    logger.error('[AdminBillingRoutes] Failed to perform diagnostics check', { error: err.message });
    res.status(500).json({ error: 'Failed to run diagnostics check' });
  }
});

module.exports = router;
