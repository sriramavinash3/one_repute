/**
 * routes/competitorRoutes.js
 *
 * REST APIs for Competitor Tracking.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb, admin } = require('../config/firebase');
const { requireFeature, requireQuota } = require('../middleware/permissionMiddleware');
const permissionService = require('../services/permissionService');
const logger = require('../utils/logger');

router.use((req, res, next) => {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Customer context required' });
  }
  next();
});

/**
 * GET /api/competitors
 * Fetch all tracked competitors.
 */
router.get('/', requireFeature('competitor_tracking'), async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('competitors')
      .where('customerId', '==', req.user.customerId)
      .get();
    
    const competitors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(competitors);
  } catch (err) {
    logger.error('[CompetitorRoutes] Failed to fetch competitors', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch competitors' });
  }
});

/**
 * POST /api/competitors
 * Add a new competitor for tracking.
 */
router.post('/', requireFeature('competitor_tracking'), requireQuota('competitor_tracking'), async (req, res) => {
  try {
    const { name, website, googlePlaceId } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Competitor name is required' });
    }

    const db = getDb();
    const payload = {
      customerId: req.user.customerId,
      name,
      website: website || null,
      googlePlaceId: googlePlaceId || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('competitors').add(payload);
    
    // Increment usage
    await permissionService.incrementUsage(req.user.customerId, 'competitor_tracking', 1);

    res.status(201).json({ id: ref.id, ...payload });
  } catch (err) {
    logger.error('[CompetitorRoutes] Failed to add competitor', { error: err.message });
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

/**
 * DELETE /api/competitors/:id
 * Remove a tracked competitor.
 */
router.delete('/:id', requireFeature('competitor_tracking'), async (req, res) => {
  try {
    const db = getDb();
    const docRef = db.collection('competitors').doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Competitor not found' });
    }

    const data = doc.data();
    if (data.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied: You do not own this competitor record' });
    }

    await docRef.delete();
    
    // Decrement usage
    await permissionService.incrementUsage(req.user.customerId, 'competitor_tracking', -1);

    res.status(200).json({ success: true, message: 'Competitor removed successfully.' });
  } catch (err) {
    logger.error('[CompetitorRoutes] Failed to remove competitor', { error: err.message });
    res.status(500).json({ error: 'Failed to remove competitor' });
  }
});

module.exports = router;
