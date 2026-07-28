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
 * GET /api/outlets/reputation-insights
 * Fetch reputation insights specific to the current outlet context
 */
router.get('/reputation-insights', async (req, res) => {
  try {
    const { getDb } = require('../config/firebase');
    const db = getDb();
    
    // Attempt to filter by outletId if available (from auth middleware or query)
    const outletId = req.query.outletId || (req.user ? req.user.outletId : null);
    let query = db.collection('reviews');
    if (outletId) {
      query = query.where('outletId', '==', outletId);
    }
    
    const reviewsSnap = await query.get();
    
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

    const categoryStats = {};

    reviewsSnap.docs.forEach(doc => {
      const data = doc.data();
      const cat = data.issueCategory;
      if (!cat) return;

      if (!categoryStats[cat]) {
        categoryStats[cat] = {
          mentions30d: 0,
          ratingsRecent: [], // last 14 days
          ratingsPast: [],   // 14-28 days ago
        };
      }

      let reviewTime = now;
      if (data.createdAt && data.createdAt.toDate) {
        reviewTime = data.createdAt.toDate();
      } else if (data.createdAt && data.createdAt.seconds) {
        reviewTime = new Date(data.createdAt.seconds * 1000);
      } else if (data.createdAt) {
        reviewTime = new Date(data.createdAt);
      } else if (data.reviewTimestamp) {
        reviewTime = new Date(data.reviewTimestamp);
      }

      const isWithin30d = (now - reviewTime) <= 30 * 24 * 60 * 60 * 1000;
      if (isWithin30d) {
        categoryStats[cat].mentions30d += 1;
      }

      if (reviewTime >= twoWeeksAgo) {
        categoryStats[cat].ratingsRecent.push(Number(data.rating) || 3);
      } else if (reviewTime >= fourWeeksAgo) {
        categoryStats[cat].ratingsPast.push(Number(data.rating) || 3);
      }
    });

    const adminCategories = [];
    const improvedOutlets = [];
    const decliningOutlets = [];

    Object.entries(categoryStats).forEach(([name, stats], idx) => {
      const avgRecent = stats.ratingsRecent.length > 0 
        ? stats.ratingsRecent.reduce((a, b) => a + b, 0) / stats.ratingsRecent.length 
        : 0;
      const avgPast = stats.ratingsPast.length > 0 
        ? stats.ratingsPast.reduce((a, b) => a + b, 0) / stats.ratingsPast.length 
        : 0;

      let trendStr = '0%';
      let improvementDiff = 0;
      
      if (avgPast > 0 && avgRecent > 0) {
        const percentChange = ((avgRecent - avgPast) / avgPast) * 100;
        trendStr = percentChange > 0 ? `+${percentChange.toFixed(1)}%` : `${percentChange.toFixed(1)}%`;
        improvementDiff = avgRecent - avgPast;
      } else if (avgRecent > 0 && avgPast === 0) {
        trendStr = '+100%';
        improvementDiff = avgRecent;
      }

      // Determine status based on recent average
      let status = 'Active';
      if (avgRecent > 0 && avgRecent <= 2.5) {
        status = 'Operational Risk';
      } else if (avgRecent > 0 && avgRecent <= 3.5) {
        status = 'Important';
      }

      adminCategories.push({
        id: `CAT-${idx}`,
        name,
        mentions: stats.mentions30d,
        trend: trendStr,
        status
      });

      // Populate Improved / Declining areas
      if (improvementDiff > 0.5) {
        improvedOutlets.push({ name, improvement: `+${improvementDiff.toFixed(1)}★`, period: '14 days' });
      } else if (improvementDiff < -0.5) {
        decliningOutlets.push({ name, improvement: `${improvementDiff.toFixed(1)}★`, period: '14 days' });
      }
    });

    // Fallback if completely empty
    if (adminCategories.length === 0) {
      adminCategories.push({ id: 'CAT-1', name: 'Service Speed', mentions: 0, trend: '0%', status: 'Active' });
    }

    const reputationInsights = {
      alerts: [
        { id: 'AL-1', type: 'pattern', title: 'Monitoring issues', description: 'System is tracking new patterns.', severity: 'medium' }
      ],
      adminCategories,
      improvedOutlets,
      decliningOutlets
    };
    
    res.status(200).json(reputationInsights);
  } catch (err) {
    logger.error('[OutletRoute] Failed to generate reputation insights', { error: err.message });
    res.status(500).json({ error: 'Failed to generate reputation insights', message: err.message });
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

/**
 * PATCH /api/outlets/reviews/:id/status
 * Update a review's status (e.g., mark as responded)
 */
router.patch('/reviews/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const db = require('../config/firebase').getDb();
    const updateData = { status, updatedAt: new Date() };
    if (status === 'responded') {
      updateData.repliedAt = new Date();
    }
    await db.collection('reviews').doc(req.params.id).update(updateData);
    res.status(200).json({ success: true });
  } catch (err) {
    logger.error('[OutletRoute] Failed to update review status', { error: err.message });
    res.status(500).json({ error: 'Failed to update review status' });
  }
});

module.exports = router;
