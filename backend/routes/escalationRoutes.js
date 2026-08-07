/**
 * routes/escalationRoutes.js
 *
 * Express routes for the Multi-Level WhatsApp Escalation Management System.
 */

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const { getDb, admin } = require('../config/firebase');
const escalationRepo = require('../repositories/escalationRepo');
const { verifyToken } = require('../middleware/auth');
const env = require('../config/env');
const logger = require('../utils/logger');

// Regex validation helpers
const E164_REGEX = /^\+[1-9]\d{1,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Helper to validate user permissions and ownership
 */
function ensureCustomerAccess(req, res, next) {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Forbidden: Customer context required' });
  }
  next();
}

/**
 * Helper to check plan limits
 * Returns the maximum level allowed for the plan
 */
function getMaxAllowedLevel(planName = '') {
  const plan = String(planName).toLowerCase();
  if (plan.includes('enterprise')) {
    return 3;
  }
  if (plan.includes('pro') || plan.includes('premium')) {
    return 2;
  }
  if (plan.includes('growth')) {
    return 1;
  }
  return 0; // Starter/default plan has no escalation levels
}

/**
 * Check if AI credits are exhausted
 */
async function checkCreditsExhausted() {
  if (!env.openai || !env.openai.apiKey) {
    return false;
  }
  try {
    const response = await axios.get('https://api.aicredits.in/api/v1/credits', {
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
      },
      timeout: 5000,
    });
    const data = response?.data?.data || {};
    return Number(data.total_usage || 0) >= Number(data.total_credits || 0);
  } catch (err) {
    logger.warn('[EscalationRoute] Failed to fetch AI credits status during check', {
      error: err.message,
    });
    return false; // Fail safe (assume not exhausted if query fails)
  }
}

/**
 * GET /api/escalation/settings
 */
router.get('/settings', verifyToken, ensureCustomerAccess, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const db = getDb();

    // Fetch customer profile for plan and master toggle status
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customerData = customerDoc.data();

    const levels = await escalationRepo.getSettingsByCustomerId(customerId);
    const creditsExhausted = await checkCreditsExhausted();

    // Auto-disable if credits are exhausted
    let masterEnabled = customerData.whatsappEscalationEnabled || false;
    if (creditsExhausted && masterEnabled) {
      await db.collection('customers').doc(customerId).update({
        whatsappEscalationEnabled: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      masterEnabled = false;

      // Log the credit exhaustion event
      await db.collection('activityLogs').add({
        type: 'ESCALATION_AUTO_DISABLED_CREDITS_EXHAUSTED',
        payload: { customerId },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
      logger.warn('[EscalationRoute] Automatically disabled escalation due to credit exhaustion', { customerId });
    }

    res.status(200).json({
      success: true,
      masterEnabled,
      levels,
      plan: customerData.plan || 'plan_starter',
      maxAllowedLevel: getMaxAllowedLevel(customerData.plan),
      creditsExhausted,
    });
  } catch (err) {
    logger.error('[EscalationRoute] Failed to fetch settings', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * POST /api/escalation/settings
 */
router.post('/settings', verifyToken, ensureCustomerAccess, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const db = getDb();
    const { masterEnabled, level, name, designation, countryCode, whatsappNumber, email, escalationMinutes, enabled } = req.body;

    // Fetch customer profile
    const customerDoc = await db.collection('customers').doc(customerId).get();
    if (!customerDoc.exists) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const customerData = customerDoc.data();

    // 1. Update Master Toggle if provided
    if (masterEnabled !== undefined) {
      const creditsExhausted = await checkCreditsExhausted();
      if (masterEnabled && creditsExhausted) {
        return res.status(400).json({ error: 'Cannot enable escalation: AI Review Credits are exhausted.' });
      }

      await db.collection('customers').doc(customerId).update({
        whatsappEscalationEnabled: Boolean(masterEnabled),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Log config change
      await db.collection('activityLogs').add({
        type: 'ESCALATION_MASTER_TOGGLE_UPDATED',
        payload: { customerId, enabled: Boolean(masterEnabled) },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    // 2. If no level is provided, just return success (updated master toggle only)
    if (level === undefined) {
      return res.status(200).json({ success: true });
    }

    // 3. Validation: Plan restrictions
    const maxLevel = getMaxAllowedLevel(customerData.plan);
    const targetLevel = Number(level);
    if (targetLevel < 1 || targetLevel > 3) {
      return res.status(400).json({ error: 'Escalation level must be between 1 and 3.' });
    }
    if (targetLevel > maxLevel) {
      return res.status(403).json({
        error: `Escalation level ${targetLevel} is locked on your current plan. Please upgrade to unlock.`,
      });
    }

    // 4. Input Field Validations
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required.' });
    }
    if (name.length > 100) {
      return res.status(400).json({ error: 'Name must not exceed 100 characters.' });
    }

    if (!whatsappNumber || !countryCode) {
      return res.status(400).json({ error: 'WhatsApp number and Country Code are required.' });
    }
    
    // E.164 Validation: Combine country code and number
    const formattedPhone = `${countryCode.startsWith('+') ? '' : '+'}${countryCode}${whatsappNumber}`.replace(/\s+/g, '');
    if (!E164_REGEX.test(formattedPhone)) {
      return res.status(400).json({ error: 'Invalid WhatsApp Number. Must follow E.164 format (e.g. +919876543210).' });
    }

    if (email && !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address format.' });
    }

    const minutes = Number(escalationMinutes);
    if (Number.isNaN(minutes) || minutes < 1 || minutes > 10080) {
      return res.status(400).json({ error: 'Escalation time must be between 1 minute and 10,080 minutes (7 days).' });
    }

    // 5. Sequential escalation time checks
    const existingLevels = await escalationRepo.getSettingsByCustomerId(customerId);
    const otherLevels = existingLevels.filter((l) => l.level !== targetLevel);

    for (const other of otherLevels) {
      if (other.level < targetLevel && minutes <= other.escalationMinutes) {
        return res.status(400).json({
          error: `Level ${targetLevel} escalation time (${minutes}m) must be greater than Level ${other.level} time (${other.escalationMinutes}m).`,
        });
      }
      if (other.level > targetLevel && minutes >= other.escalationMinutes) {
        return res.status(400).json({
          error: `Level ${targetLevel} escalation time (${minutes}m) must be less than Level ${other.level} time (${other.escalationMinutes}m).`,
        });
      }
    }

    // 6. Duplicate WhatsApp number check across levels
    for (const other of otherLevels) {
      const otherPhone = `${other.countryCode}${other.whatsappNumber}`.replace(/\s+/g, '');
      const targetPhone = `${countryCode}${whatsappNumber}`.replace(/\s+/g, '');
      if (otherPhone === targetPhone) {
        return res.status(400).json({ error: 'Duplicate WhatsApp Number. Recipient cannot be identical to another level.' });
      }
    }

    // 7. Save settings
    const docId = await escalationRepo.saveSetting(customerId, targetLevel, {
      name,
      designation,
      countryCode,
      whatsappNumber,
      email: email || null,
      escalationMinutes: minutes,
      enabled: enabled !== false,
    });

    // Log configuration audit trail
    await db.collection('activityLogs').add({
      type: 'ESCALATION_LEVEL_CONFIGURED',
      payload: { customerId, level: targetLevel, name, escalationMinutes: minutes },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, id: docId });
  } catch (err) {
    logger.error('[EscalationRoute] Failed to save settings', { error: err.message });
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

/**
 * PUT /api/escalation/settings
 */
router.put('/settings', verifyToken, ensureCustomerAccess, async (req, res) => {
  // Alias PUT settings to POST settings handler for convenience
  return router.handle(req, res);
});

/**
 * DELETE /api/escalation/settings/:level
 */
router.delete('/settings/:level', verifyToken, ensureCustomerAccess, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const targetLevel = Number(req.params.level);

    if (Number.isNaN(targetLevel) || targetLevel < 1 || targetLevel > 3) {
      return res.status(400).json({ error: 'Invalid level parameter' });
    }

    await escalationRepo.deleteSetting(customerId, targetLevel);

    // Audit log
    const db = getDb();
    await db.collection('activityLogs').add({
      type: 'ESCALATION_LEVEL_DELETED',
      payload: { customerId, level: targetLevel },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, message: `Escalation Level ${targetLevel} settings deleted.` });
  } catch (err) {
    logger.error('[EscalationRoute] Failed to delete level settings', { error: err.message });
    res.status(500).json({ error: 'Failed to delete settings' });
  }
});

/**
 * GET /api/escalation/history
 */
router.get('/history', verifyToken, ensureCustomerAccess, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const history = await escalationRepo.getHistoryByCustomerId(customerId);
    res.status(200).json(history);
  } catch (err) {
    logger.error('[EscalationRoute] Failed to fetch escalation history', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

/**
 * GET /api/escalation/status/:reviewId
 */
router.get('/status/:reviewId', verifyToken, ensureCustomerAccess, async (req, res) => {
  try {
    const customerId = req.user.customerId;
    const reviewId = req.params.reviewId;
    const db = getDb();

    // Fetch review and validate ownership
    const reviewDoc = await db.collection('reviews').doc(reviewId).get();
    if (!reviewDoc.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }
    const reviewData = reviewDoc.data();

    // Verify ownership: customerId on review must match
    if (reviewData.customerId !== customerId) {
      // Fallback check: look up outlet ownership
      const outletDoc = await db.collection('outlets').doc(reviewData.outletId).get();
      if (!outletDoc.exists || outletDoc.data().customerId !== customerId) {
        return res.status(403).json({ error: 'Forbidden: You do not own this review' });
      }
    }

    // Query logs
    const logs = await escalationRepo.getHistoryByReviewId(reviewId);

    // Compute remaining countdown
    let remainingMs = 0;
    if (reviewData.nextEscalationTime && reviewData.escalationStatus && reviewData.escalationStatus.endsWith('_pending')) {
      const nextTime = reviewData.nextEscalationTime.toDate ? reviewData.nextEscalationTime.toDate().getTime() : new Date(reviewData.nextEscalationTime).getTime();
      remainingMs = Math.max(0, nextTime - Date.now());
    }

    res.status(200).json({
      success: true,
      escalationStatus: reviewData.escalationStatus || 'no_escalation',
      escalationCurrentLevel: reviewData.escalationCurrentLevel || 0,
      nextEscalationTime: reviewData.nextEscalationTime || null,
      remainingSeconds: Math.floor(remainingMs / 1000),
      timeline: logs,
    });
  } catch (err) {
    logger.error('[EscalationRoute] Failed to fetch review status', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch review status' });
  }
});

module.exports = router;
