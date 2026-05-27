/**
 * routes/outletRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const outletRepo = require('../repositories/outletRepo');
const logger = require('../utils/logger');

/**
 * GET /api/outlets
 * List all active outlets
 */
router.get('/', async (req, res) => {
  try {
    const outlets = await outletRepo.getActiveOutlets();
    res.status(200).json(outlets);
  } catch (err) {
    logger.error('[OutletRoute] Failed to fetch outlets', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch outlets' });
  }
});

/**
 * GET /api/outlets/:id
 * Get single outlet details
 */
router.get('/:id', async (req, res) => {
  try {
    const outlet = await outletRepo.getOutletById(req.params.id);
    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }
    res.status(200).json(outlet);
  } catch (err) {
    logger.error('[OutletRoute] Failed to fetch outlet', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch outlet' });
  }
});

/**
 * PUT /api/outlets/:id
 * Update outlet details/settings
 */
router.post('/:id', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb();
    await db.collection('outlets').doc(req.params.id).set(req.body, { merge: true });
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[OutletRoute] Failed to update outlet', { error: err.message });
    res.status(500).json({ error: 'Failed to update outlet' });
  }
});

/**
 * GET /api/outlets/:id/settings
 * Get outlet specific settings
 */
router.get('/:id/settings', async (req, res) => {
    try {
      const outlet = await outletRepo.getOutletById(req.params.id);
      if (!outlet) {
        return res.status(404).json({ error: 'Outlet not found' });
      }
      // Return only settings relevant fields
      res.status(200).json({
        name: outlet.name,
        openaiPrompt: outlet.openaiPrompt || '',
        whatsappNumber: outlet.whatsappNumber || '',
        autoResponseEnabled: outlet.autoResponseEnabled || false,
        minRatingForAutoResponse: outlet.minRatingForAutoResponse || 4,
      });
    } catch (err) {
      logger.error('[OutletRoute] Failed to fetch settings', { error: err.message });
      res.status(500).json({ error: 'Failed to fetch settings' });
    }
  });

module.exports = router;
