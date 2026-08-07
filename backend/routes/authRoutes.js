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
 * GET /api/auth/google/onboard
 */
router.get('/google/onboard', async (req, res) => {
  try {
    const uid = req.query.uid;
    if (!uid) {
      return res.status(400).json({ error: 'Missing uid' });
    }
    const url = googleOAuth.getConsentUrl(`onboard_${uid}`);
    return res.redirect(url);
  } catch (err) {
    logger.error('[AuthRoute] Failed to create onboard consent URL', { error: err.message });
    return res.status(500).json({ error: 'Failed to start Google OAuth' });
  }
});

/**
 * GET /api/auth/google/callback
 */
router.get('/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  if (error) {
    if (state && state.startsWith('onboard_')) {
      return res.send(`<script>window.opener.postMessage({ type: "gmb-error", error: "${error}" }, "*"); window.close();</script>`);
    }
    return res.status(400).json({ error: `Google OAuth error: ${error}` });
  }

  const stateStr = state ? decodeURIComponent(state) : req.query.outletId;

  // Handle Onboarding OAuth flow
  if (stateStr && stateStr.startsWith('onboard_')) {
    const uid = stateStr.replace('onboard_', '');
    if (!code) {
      return res.send('<script>window.opener.postMessage({ type: "gmb-error", error: "Missing code" }, "*"); window.close();</script>');
    }

    try {
      const { oauth2Client, tokens } = await googleOAuth.exchangeCodeForTokens(code);
      if (!tokens.refresh_token) {
        return res.send('<script>window.opener.postMessage({ type: "gmb-error", error: "Missing refresh token. Please reconnect and ensure you grant all permissions." }, "*"); window.close();</script>');
      }

      const accountEmail = await googleOAuth.fetchAccountEmail(oauth2Client);
      const { accountId, locations } = await googleOAuth.fetchAccountsAndLocations(oauth2Client);

      await outletRepo.saveOnboardingSession(uid, {
        googleRefreshToken: tokens.refresh_token,
        googleAccountEmail: accountEmail,
        googleAccountId: accountId,
        googleLocations: locations,
        googleTokenScope: tokens.scope || null,
        googleTokenExpiresAt: tokens.expiry_date || null,
      });

      return res.send('<script>window.opener.postMessage({ type: "gmb-connected" }, "*"); window.close();</script>');
    } catch (err) {
      logger.error('[AuthRoute] Onboard OAuth callback failed', { error: err.message });
      return res.send(`<script>window.opener.postMessage({ type: "gmb-error", error: "${err.message}" }, "*"); window.close();</script>`);
    }
  }

  // Handle existing outlet OAuth flow
  const outletId = stateStr;
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
    const isAdminEmail = (email || '').toLowerCase() === 'admin@onerepute.com';
    
    // 1. Check Admin Whitelist (Strictly admin@onerepute.com)
    if (isAdminEmail) {
      const adminSnap = await db.collection('admins').doc(uid).get();
      return res.status(200).json({ 
        authorized: true, 
        role: 'admin',
        profile: adminSnap.exists ? adminSnap.data() : { email, role: 'admin' } 
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
 * GET /api/auth/onboarding-session/:uid
 */
router.get('/onboarding-session/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    if (!uid) return res.status(400).json({ error: 'Missing uid' });

    const session = await outletRepo.getOnboardingSession(uid);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Expose only needed info to frontend
    return res.status(200).json({
      googleAccountEmail: session.googleAccountEmail,
      googleLocations: session.googleLocations || [],
    });
  } catch (err) {
    logger.error('[AuthRoute] Fetch onboarding session failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to fetch session' });
  }
});

/**
 * POST /api/auth/onboard
 * Handle new user onboarding, bypasses frontend security rules
 */
router.post('/onboard', async (req, res) => {
  const { form, paymentData, isTrial, discountData, userUid, userEmail } = req.body;
  
  if (!userUid || !userEmail) return res.status(400).json({ error: 'Missing user data' });

  try {
    const session = await outletRepo.getOnboardingSession(userUid);
    if (!session || !session.googleRefreshToken) {
      return res.status(400).json({ error: 'Missing Google authorization. Please connect Google My Business.' });
    }

    const selectedLocation = session.googleLocations?.find(l => l.id === form.placeId) || {};
    const businessName = form.businessName || selectedLocation.name || 'Unknown Business';

    const db = require('../config/firebase').getDb();
    const batch = db.batch();

    const customerRef = db.collection('customers').doc();
    const outletRef = db.collection('outlets').doc();
    const userRef = db.collection('users').doc(userUid);

    const now = new Date();
    const trialEndsAt = isTrial ? new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) : null;

    batch.set(customerRef, {
      name: businessName,
      email: userEmail,
      phone: form.managerPhone,
      plan: form.planId,
      subscriptionStatus: isTrial ? 'trialing' : 'active',
      trialEndsAt: trialEndsAt,
      razorpaySubscriptionId: paymentData?.razorpay_subscription_id || null,
      razorpayPaymentId: paymentData?.razorpay_payment_id || null,
      appliedDiscount: discountData || null,
      createdAt: now
    });

    const encrypt = require('../utils/crypto').encrypt;

    batch.set(outletRef, {
      name: businessName,
      businessType: form.businessType,
      managerPhone: form.managerPhone,
      whatsappNumber: form.managerPhone,
      address: form.address || '',
      placeId: form.placeId || '',
      providerType: 'GBP',
      googleLocationId: form.placeId || '',
      googleLocationName: selectedLocation.name || '',
      googleAccountId: session.googleAccountId || '',
      googleRefreshToken: encrypt(session.googleRefreshToken),
      googleAccountEmail: session.googleAccountEmail || '',
      googleTokenScope: session.googleTokenScope || '',
      googleTokenExpiresAt: session.googleTokenExpiresAt || null,
      googleLocations: session.googleLocations || [],
      googleConnectedAt: now,
      ownerId: userUid,
      customerId: customerRef.id,
      email: userEmail,
      isActive: true,
      createdAt: now
    });

    batch.update(userRef, {
      businessName: businessName,
      outletId: outletRef.id,
      customerId: customerRef.id,
      isSetupComplete: true,
      role: 'outlet',
      updatedAt: now
    });

    await batch.commit();

    // Clean up temporary session
    await outletRepo.deleteOnboardingSession(userUid);

    // Queue Welcome and Verification Emails asynchronously (never block response)
    const emailBridge = require('../src/modules/email/email.integration');
    const userName = businessName || userEmail.split('@')[0];
    
    emailBridge.queueWelcomeEmail(userEmail, userName, userUid).catch((err) => {
      logger.error('[AuthRoute] Failed to queue welcome email:', err.message);
    });

    emailBridge.queueVerificationEmail(userEmail, userName, userUid).catch((err) => {
      logger.error('[AuthRoute] Failed to queue verification email:', err.message);
    });

    if (isTrial || paymentData?.razorpay_subscription_id) {
      const planName = form.planId || 'Pro Plan';
      const amount = isTrial ? '$0 (14-Day Free Trial)' : '$49.00 / month';
      const renewal = trialEndsAt ? trialEndsAt.toDateString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toDateString();
      emailBridge.queueSubscriptionActivatedEmail(userEmail, userName, planName, amount, renewal).catch((err) => {
        logger.error('[AuthRoute] Failed to queue subscription confirmation:', err.message);
      });
    }

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

/**
 * POST /api/auth/signup
 * Enterprise signup flow: Creates user via Firebase Admin SDK, initializes profile,
 * queues Welcome & Verification emails via Resend (BullMQ), and returns custom token.
 * NO client-side Firebase emails are ever triggered!
 */
router.post('/signup', async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' });
  }

  try {
    const { admin } = require('../config/firebase');
    const db = require('../config/firebase').getDb();

    // 1. Create or fetch user in Firebase Auth via Admin SDK
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name || email.split('@')[0],
        emailVerified: false,
      });
    } catch (createErr) {
      if (createErr.code === 'auth/email-already-exists') {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        throw createErr;
      }
    }

    // 2. Initialize Firestore user profile
    const userRef = db.collection('users').doc(userRecord.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      await userRef.set({
        email,
        name: name || email.split('@')[0],
        role: 'outlet',
        isSetupComplete: false,
        isVerified: false,
        createdAt: new Date(),
      });
    }

    // 3. Queue Resend Transactional Emails (Welcome + Verification)
    const emailBridge = require('../src/modules/email/email.integration');
    const userName = name || email.split('@')[0];

    emailBridge.queueWelcomeEmail(email, userName, userRecord.uid).catch((err) => {
      logger.error('[AuthRoute] Failed to queue welcome email:', err.message);
    });

    emailBridge.queueVerificationEmail(email, userName, userRecord.uid).catch((err) => {
      logger.error('[AuthRoute] Failed to queue verification email:', err.message);
    });

    // 4. Generate custom authentication token for instant client sign-in
    const customToken = await admin.auth().createCustomToken(userRecord.uid);

    return res.status(201).json({
      success: true,
      customToken,
      uid: userRecord.uid,
      email: userRecord.email,
      message: 'Account created successfully. Welcome and verification emails dispatched via Resend.',
    });
  } catch (err) {
    logger.error('[AuthRoute] Signup failed:', { error: err.message, email });
    return res.status(500).json({ error: err.message || 'Failed to complete signup' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Generates secure SHA-256 hashed single-use token and queues password reset email via Resend.
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Missing email address' });
  }

  try {
    const emailBridge = require('../src/modules/email/email.integration');
    const userName = email.split('@')[0];

    await emailBridge.queuePasswordResetEmail(email, userName);

    return res.status(200).json({
      success: true,
      message: 'If an account exists with that email, a password reset link has been dispatched via Resend.',
    });
  } catch (err) {
    logger.error('[AuthRoute] Forgot password failed:', { error: err.message, email });
    return res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

/**
 * POST /api/auth/reset-password
 * Validates raw token against stored SHA-256 hash, updates password via Firebase Admin SDK,
 * invalidates token, and queues Password Changed alert via Resend.
 */
router.post('/reset-password', async (req, res) => {
  const { email, token, newPassword } = req.body || {};
  if (!email || !token || !newPassword) {
    return res.status(400).json({ error: 'Missing required parameters (email, token, newPassword)' });
  }

  try {
    const emailBridge = require('../src/modules/email/email.integration');
    const validation = await emailBridge.tokenService.validateToken(email, token);

    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason || 'Invalid or expired password reset token' });
    }

    // Update password in Firebase Auth via Admin SDK
    const { admin } = require('../config/firebase');
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password: newPassword });

    // Invalidate token immediately to prevent replay attacks
    await emailBridge.tokenService.invalidateToken(token);

    // Queue Password Changed security notification email
    const userName = email.split('@')[0];
    await emailBridge.queuePasswordChangedEmail(email, userName, userRecord.uid, req.headers['user-agent']);

    return res.status(200).json({
      success: true,
      message: 'Password successfully updated and security alert dispatched via Resend.',
    });
  } catch (err) {
    logger.error('[AuthRoute] Password reset completion failed:', { error: err.message, email });
    return res.status(500).json({ error: 'Failed to reset password: ' + err.message });
  }
});

/**
 * GET /api/auth/verify-email-token
 * Validates raw email verification token, updates user as emailVerified in Firebase Admin,
 * updates Firestore user record, and invalidates token.
 */
router.get('/verify-email-token', async (req, res) => {
  const { email, token } = req.query || {};
  if (!email || !token) {
    return res.status(400).json({ error: 'Missing token or email' });
  }

  try {
    const emailBridge = require('../src/modules/email/email.integration');
    const validation = await emailBridge.tokenService.validateToken(String(email), String(token));

    if (!validation.valid) {
      return res.status(400).json({ error: validation.reason || 'Invalid or expired verification token' });
    }

    // Update emailVerified in Firebase Auth via Admin SDK & Firestore
    const { admin } = require('../config/firebase');
    const db = require('../config/firebase').getDb();
    
    try {
      const userRecord = await admin.auth().getUserByEmail(String(email));
      await admin.auth().updateUser(userRecord.uid, { emailVerified: true });
      await db.collection('users').doc(userRecord.uid).set({ isVerified: true }, { merge: true });
    } catch (err) {
      logger.warn('[AuthRoute] User update during email verification notice:', err.message);
    }

    await emailBridge.tokenService.invalidateToken(String(token));

    return res.status(200).json({
      success: true,
      message: 'Email address verified successfully!',
    });
  } catch (err) {
    logger.error('[AuthRoute] Email verification failed:', { error: err.message, email });
    return res.status(500).json({ error: 'Failed to verify email address' });
  }
});

module.exports = router;

