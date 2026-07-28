/**
 * routes/authRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const env = require('../config/env');
const logger = require('../utils/logger');
const outletRepo = require('../repositories/outletRepo');
const googleOAuth = require('../services/googleOAuthService');
const { processSingleOutletReviewsImmediately } = require("../services/reviewService");



/**
 * GET /api/auth/google
 */
router.get('/google', async (req, res) => {
  try {
    const outletId = req.query.outletId;
    if (!outletId) {
      return res.status(400).json({ error: 'Missing outletId' });
    }
    const url = googleOAuth.getConsentUrl(outletId);
    return res.redirect(url);
  } catch (err) {
    logger.error('[AuthRoute] Failed to create consent URL', { error: err.message });
    return res.status(500).json({ error: 'Failed to start Google OAuth' });
  }
});

/**
 * GET /api/auth/google/callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) return res.status(400).json({ error: `Google OAuth error: ${error}` });

  const outletId = state ? decodeURIComponent(state) : req.query.outletId;
  if (!code || !outletId) return res.status(400).json({ error: 'Missing code or outletId' });

  try {
    const { oauth2Client, tokens } = await googleOAuth.exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      return res.status(400).json({ error: 'Missing refresh token. Reconnect.' });
    }

    const accountEmail = await googleOAuth.fetchAccountEmail(oauth2Client);

    await outletRepo.updateGoogleConnection(outletId, {
      googleRefreshToken: tokens.refresh_token,
      googleAccountEmail: accountEmail,
      googleTokenScope: tokens.scope || null,
      googleTokenExpiresAt: tokens.expiry_date || null,
      isActive: true,
    });

    return res.redirect(`${env.frontendBaseUrl}/outlet-dashboard?connected=true`);
  } catch (err) {
    logger.error('[AuthRoute] OAuth callback failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to complete Google OAuth' });
  }
});

/**
 * GET /api/auth/google/status
 */
router.get('/google/status', async (req, res) => {
  try {
    const outletId = req.query.outletId;
    if (!outletId) return res.status(400).json({ error: 'Missing outletId' });

    const outlet = await outletRepo.getOutletById(outletId);
    if (!outlet) return res.status(404).json({ error: 'Outlet not found' });

    return res.status(200).json({
      connected: Boolean(outlet.googleRefreshToken),
      accountEmail: outlet.googleAccountEmail || null,
      activeLocation: outlet.googleLocationName || null,
      locations: outlet.googleLocations || [],
    });
  } catch (err) {
    logger.error('[AuthRoute] Failed to fetch status', { error: err.message });
    return res.status(500).json({ error: 'Failed to fetch status' });
  }
});

/**
 * POST /api/auth/google/active-location
 */
router.post('/google/active-location', async (req, res) => {
  try {
    const { outletId, locationId } = req.body || {};
    if (!outletId || !locationId) return res.status(400).json({ error: 'Missing data' });

    const outlet = await outletRepo.getOutletById(outletId);
    if (!outlet) return res.status(404).json({ error: 'Outlet not found' });

    const locations = outlet.googleLocations || [];
    const selected = locations.find((l) => l.id === locationId);
    if (!selected) return res.status(400).json({ error: 'Location not found' });

    await outletRepo.setActiveGoogleLocation(outletId, selected.id, selected.name);

    // Trigger immediate review processing for the newly configured outlet
    processSingleOutletReviewsImmediately(outletId).catch(err => {
      logger.error(`[AuthRoute] Failed to trigger immediate review processing for outlet ${outletId} after setting active location`, { error: err.message });
    });


    return res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[AuthRoute] Failed to set location', { error: err.message });
    return res.status(500).json({ error: 'Failed to set location' });
  }
});

/**
 * POST /api/auth/verify-user
 * Verifies if a user's email is in the admin-controlled whitelist.
 */
router.post('/verify-user', async (req, res) => {
  const { email, uid } = req.body;
  
  if (!email || !uid) {
    return res.status(400).json({ error: 'Missing email or uid' });
  }

  try {
    const db = require('../config/firebase').getDb();
    
    // 1. Check Admin Whitelist
    const adminSnap = await db.collection('admins').doc(uid).get();
    if (adminSnap.exists) {
      return res.status(200).json({ 
        authorized: true, 
        role: 'admin',
        profile: adminSnap.data() 
      });
    }

    // 2. Check Outlet Whitelist (By Email)
    const outletsRef = db.collection('outlets');
    const outletSnap = await outletsRef.where('email', '==', email).get();

    if (!outletSnap.empty) {
      const outletDoc = outletSnap.docs[0];
      return res.status(200).json({ 
        authorized: true, 
        role: 'outlet',
        outletId: outletDoc.id,
        outletData: outletDoc.data()
      });
    }

    // 3. Not Authorized
    return res.status(403).json({ 
      authorized: false, 
      error: 'User not in whitelist' 
    });

  } catch (err) {
    logger.error('[AuthRoute] Verification failed', { error: err.message });
    return res.status(500).json({ error: 'Internal verification error' });
  }
});

/**
 * POST /api/auth/onboard
 * Handle new user onboarding, bypasses frontend security rules
 */
router.post('/onboard', async (req, res) => {
  const { form, paymentData, isTrial, userUid, userEmail } = req.body;
  
  if (!userUid || !userEmail) return res.status(400).json({ error: 'Missing user data' });

  try {
    const db = require('../config/firebase').getDb();
    const batch = db.batch();

    const customerRef = db.collection('customers').doc();
    const outletRef = db.collection('outlets').doc();
    const userRef = db.collection('users').doc(userUid);

    const now = new Date();
    const trialEndsAt = isTrial ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

    batch.set(customerRef, {
      name: form.businessName,
      email: userEmail,
      phone: form.managerPhone,
      plan: form.planId,
      subscriptionStatus: isTrial ? 'trialing' : 'active',
      trialEndsAt: trialEndsAt,
      razorpaySubscriptionId: paymentData?.razorpay_subscription_id || null,
      razorpayPaymentId: paymentData?.razorpay_payment_id || null,
      createdAt: now
    });

    batch.set(outletRef, {
      name: form.businessName,
      businessType: form.businessType,
      managerPhone: form.managerPhone,
      whatsappNumber: form.managerPhone,
      address: form.address || '',
      placeId: form.placeId || '',
      ownerId: userUid,
      customerId: customerRef.id,
      email: userEmail,
      isActive: true,
      createdAt: now
    });

    batch.update(userRef, {
      businessName: form.businessName,
      outletId: outletRef.id,
      customerId: customerRef.id,
      isSetupComplete: true,
      role: 'outlet',
      updatedAt: now
    });

    await batch.commit();

    // Trigger initial review scrape in the background
    const { processSingleOutletReviewsImmediately } = require('../services/reviewService');
    processSingleOutletReviewsImmediately(outletRef.id).catch(err => {
      logger.error('[AuthRoute] Background review scrape failed', { error: err.message, outletId: outletRef.id });
    });

    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[AuthRoute] Onboarding failed', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
