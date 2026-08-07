/**
 * routes/qrRoutes.js
 *
 * REST APIs for Smart QR Codes.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb, admin } = require('../config/firebase');
const { requireFeature, requireQuota } = require('../middleware/permissionMiddleware');
const permissionService = require('../services/permissionService');
const logger = require('../utils/logger');

// Middleware to ensure customer context
router.use((req, res, next) => {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Customer context required' });
  }
  next();
});

/**
 * GET /api/qr
 * Fetch all QR codes generated for the customer.
 */
router.get('/', requireFeature('smart_qr'), async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('smart_qrs')
      .where('customerId', '==', req.user.customerId)
      .get();
    
    const qrs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(qrs);
  } catch (err) {
    logger.error('[QrRoutes] Failed to fetch QRs', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch QRs' });
  }
});

/**
 * POST /api/qr
 * Create a new Smart QR code.
 */
router.post('/', requireFeature('smart_qr'), requireQuota('smart_qr'), async (req, res) => {
  try {
    const { name, redirectUrl } = req.body;
    if (!name || !redirectUrl) {
      return res.status(400).json({ error: 'Missing name or redirectUrl' });
    }

    const db = getDb();
    const payload = {
      customerId: req.user.customerId,
      name,
      redirectUrl,
      // Smart QR short URL simulation
      shortUrl: `https://onerepute.co/qr/${Math.random().toString(36).substring(2, 8)}`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('smart_qrs').add(payload);
    
    // Increment usage
    await permissionService.incrementUsage(req.user.customerId, 'smart_qr', 1);

    res.status(201).json({ id: ref.id, ...payload });
  } catch (err) {
    logger.error('[QrRoutes] Failed to generate QR', { error: err.message });
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

/**
 * GET /api/qr/:id
 * Retrieve specific QR code details.
 */
router.get('/:id', requireFeature('smart_qr'), async (req, res) => {
  try {
    const db = getDb();
    const doc = await db.collection('smart_qrs').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    const data = doc.data();
    if (data.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied: You do not own this QR code' });
    }

    res.status(200).json({ id: doc.id, ...data });
  } catch (err) {
    logger.error('[QrRoutes] Failed to fetch QR detail', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch QR details' });
  }
});

module.exports = router;
