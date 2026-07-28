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
    if (!outletId) {
      return res.status(400).json({ error: 'outletId is required' });
    }
    let query = db.collection('reviews').where('outletId', '==', outletId);
    
    const [reviewsSnap, outletSnap] = await Promise.all([
      query.get(),
      db.collection('outlets').doc(outletId).get()
    ]);
    
    const categoryRules = (outletSnap.exists && outletSnap.data().categoryRules) ? outletSnap.data().categoryRules : {};
    
    let dateRange = req.query.dateRange || '30d';
    const now = new Date();
    const nowMs = now.getTime();
    const msPerDay = 24 * 60 * 60 * 1000;
    
    let totalThresholdMs, recentThresholdMs, pastThresholdMs;
    let labelPeriod = '14 days';

    switch (dateRange) {
      case '7d':
        totalThresholdMs = nowMs - (7 * msPerDay);
        recentThresholdMs = nowMs - (3 * msPerDay);
        pastThresholdMs = nowMs - (7 * msPerDay);
        labelPeriod = '3 days';
        break;
      case '90d':
        totalThresholdMs = nowMs - (90 * msPerDay);
        recentThresholdMs = nowMs - (45 * msPerDay);
        pastThresholdMs = nowMs - (90 * msPerDay);
        labelPeriod = '45 days';
        break;
      case 'all':
        totalThresholdMs = 0; // Epoch
        // If all time, let's treat the last 60 days as 'recent' and the 60 before that as 'past'
        recentThresholdMs = nowMs - (60 * msPerDay);
        pastThresholdMs = nowMs - (120 * msPerDay); 
        labelPeriod = '60 days';
        break;
      case '30d':
      default:
        totalThresholdMs = nowMs - (30 * msPerDay);
        recentThresholdMs = nowMs - (14 * msPerDay);
        pastThresholdMs = nowMs - (28 * msPerDay);
        labelPeriod = '14 days';
        break;
    }

    const recentThreshold = new Date(recentThresholdMs);
    const pastThreshold = new Date(pastThresholdMs);
    const totalThreshold = new Date(totalThresholdMs);

    const categoryStats = {};

    reviewsSnap.docs.forEach(doc => {
      const data = doc.data();
      let cat = data.issueCategory;
      if (!cat) return;
      
      // Apply merge mapping
      if (categoryRules[cat] && categoryRules[cat].mappedTo) {
        cat = categoryRules[cat].mappedTo;
      }

      if (!categoryStats[cat]) {
        categoryStats[cat] = {
          mentions: 0,
          ratingsRecent: [],
          ratingsPast: [],
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

      if (reviewTime >= totalThreshold) {
        categoryStats[cat].mentions += 1;
      }

      if (reviewTime >= recentThreshold) {
        categoryStats[cat].ratingsRecent.push(Number(data.rating) || 3);
      } else if (reviewTime >= pastThreshold && reviewTime < recentThreshold) {
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
      const manualStatus = categoryRules[name] ? categoryRules[name].status : null;
      if (manualStatus) {
        status = manualStatus;
      } else {
        if (avgRecent > 0 && avgRecent <= 2.5) {
          status = 'Operational Risk';
        } else if (avgRecent > 0 && avgRecent <= 3.5) {
          status = 'Important';
        }
      }

      const displayName = categoryRules[name] && categoryRules[name].newName ? categoryRules[name].newName : name;
      const customNote = categoryRules[name] ? categoryRules[name].customNote : null;

      adminCategories.push({
        id: `CAT-${idx}`,
        name: displayName,
        originalName: name,
        mentions: stats.mentions,
        trend: trendStr,
        status,
        customNote
      });

      // Populate Improved / Declining areas
      if (improvementDiff > 0.5) {
        improvedOutlets.push({ name: displayName, improvement: `+${improvementDiff.toFixed(1)}★`, period: labelPeriod });
      } else if (improvementDiff < -0.5) {
        decliningOutlets.push({ name: displayName, improvement: `${improvementDiff.toFixed(1)}★`, period: labelPeriod });
      }
    });

    // Fallback if completely empty
    if (adminCategories.length === 0) {
      adminCategories.push({ id: 'CAT-1', name: 'Service Speed', mentions: 0, trend: '0%', status: 'Active' });
    }

    // Generate Dynamic Alerts
    const alerts = [];
    if (decliningOutlets.length > 0) {
      alerts.push({ id: 'AL-1', type: 'pattern', title: 'Negative review spike alert', description: `${decliningOutlets[0].name} has seen a significant drop in ratings.`, severity: 'high' });
    }
    const highRiskCat = adminCategories.find(c => c.status === 'Operational Risk');
    if (highRiskCat) {
      alerts.push({ id: 'AL-2', type: 'pattern', title: 'Low rating pattern alert', description: `${highRiskCat.name} is consistently receiving low ratings.`, severity: 'high' });
    }
    if (alerts.length === 0) {
      alerts.push({ id: 'AL-3', type: 'pattern', title: 'Monitoring issues', description: 'System is tracking new patterns. No critical alerts.', severity: 'medium' });
    }

    // Determine Risk Rankings
    const customerRiskScores = {};
    let outletRiskScore = 0;
    
    reviewsSnap.docs.forEach(doc => {
      const data = doc.data();
      const rating = Number(data.rating) || 3;
      if (rating <= 3) {
        const customer = data.customerName || 'Anonymous';
        customerRiskScores[customer] = (customerRiskScores[customer] || 0) + (4 - rating);
        outletRiskScore += (4 - rating);
      }
    });
    
    const customerRiskRanking = Object.entries(customerRiskScores)
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const reputationInsights = {
      alerts,
      adminCategories,
      improvedOutlets,
      decliningOutlets,
      customerRiskRanking,
      outletRiskScore
    };
    
    res.status(200).json(reputationInsights);
  } catch (err) {
    logger.error('[OutletRoute] Failed to generate reputation insights', { error: err.message });
    res.status(500).json({ error: 'Failed to generate reputation insights', message: err.message });
  }
});

/**
 * POST /api/outlets/reputation-insights/rules
 * Update category admin rules (merge, rename, etc.)
 */
router.post('/reputation-insights/rules', async (req, res) => {
  try {
    const { getDb } = require('../config/firebase');
    const db = getDb();
    const outletId = req.body.outletId || (req.user ? req.user.outletId : null);
    if (!outletId) return res.status(400).json({ error: 'Missing outletId' });

    const { categoryName, actionType, inputValue } = req.body;
    if (!categoryName || !actionType) return res.status(400).json({ error: 'Missing parameters' });

    const outletRef = db.collection('outlets').doc(outletId);
    const outletSnap = await outletRef.get();
    let categoryRules = {};
    if (outletSnap.exists && outletSnap.data().categoryRules) {
      categoryRules = outletSnap.data().categoryRules;
    }

    if (!categoryRules[categoryName]) {
      categoryRules[categoryName] = {};
    }

    switch (actionType) {
      case 'Rename category':
        categoryRules[categoryName].newName = inputValue;
        break;
      case 'Merge into similar category':
      case 'Correct AI misclassification':
        categoryRules[categoryName].mappedTo = inputValue;
        break;
      case 'Tag as Operational Risk':
        categoryRules[categoryName].status = 'Operational Risk';
        break;
      case 'Mark as Important':
        categoryRules[categoryName].status = 'Important';
        break;
      case 'Add custom insight note':
        categoryRules[categoryName].customNote = inputValue;
        break;
    }

    await outletRef.update({ categoryRules });
    res.status(200).json({ success: true, categoryRules });
  } catch (err) {
    logger.error('[OutletRoute] Failed to update rules', { error: err.message });
    res.status(500).json({ error: 'Failed to update rules' });
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
