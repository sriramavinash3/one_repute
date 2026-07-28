/**
 * routes/adminRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const axios = require('axios');
const env = require('../config/env');
const outletRepo = require('../repositories/outletRepo');
const logger = require('../utils/logger');
const { processSingleOutletReviewsImmediately } = require("../services/reviewService"); // Add this line
/**
 * GET /api/admin/credits
 * Return best-effort credit / balance info for external providers.
 * - Apify: calls Apify API to read `credits` when APIFY_TOKEN is configured
 * - OpenAI / Twilio: placeholder null unless custom endpoints are provided
 */
router.get('/credits', async (req, res) => {
  try {
    const credits = {
      openai: {
        available: null,
        used: null,
        currency: 'USD',
      },

      twilio: {
        balance: null,
        currency: 'USD',
      }
    };


    /*
    * =========================================================
    * AI CREDITS
    * =========================================================
    */

    if (env.openai && env.openai.apiKey) {
      
      try {
      
        const aiCreditsResp = await axios.get(
          'https://api.aicredits.in/api/v1/credits',
          {
            headers: {
              Authorization: `Bearer ${env.openai.apiKey}`,
            },
            timeout: 10000,
          }
        );

      

        const data = aiCreditsResp?.data?.data || {};

        credits.openai = {
          totalCredits: data.total_credits || 0,
          totalUsage: data.total_usage || 0,
          creditsInr: data.credits_inr || 0,
        };

      } catch (err) {
        console.log(err)
        logger.warn('[AdminRoute] AI Credits lookup failed', {
          error: err?.response?.data || err.message,
        });
      }
    }


    /*
     * =========================================================
     * TWILIO
     * =========================================================
     */
    
      const twilio = env.whatsapp?.twilio || {};

      if (twilio.accountSid && twilio.authToken) {
        try {

          /*
          * -----------------------------------------
          * BALANCE (credits left)
          * -----------------------------------------
          */

          const balanceResp = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Balance.json`,
            {
              auth: {
                username: twilio.accountSid,
                password: twilio.authToken,
              },
              timeout: 10000,
            }
          );

          const balanceData = balanceResp?.data || {};

          const creditsLeft =
            Number(balanceData.balance || 0);

          /*
          * -----------------------------------------
          * ALL TIME USAGE
          * -----------------------------------------
          */

          const usageResp = await axios.get(
            `https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Usage/Records/AllTime.json`,
            {
              auth: {
                username: twilio.accountSid,
                password: twilio.authToken,
              },
              timeout: 10000,
            }
          );

          const usageData = usageResp?.data || {};

          let usedCredits = 0;

          if (
            Array.isArray(usageData.usage_records)
          ) {
            usedCredits = usageData.usage_records.reduce(
              (total, record) => {
                return (
                  total +
                  Math.abs(Number(record.price || 0))
                );
              },
              0
            );
          }

          credits.twilio = {
            usedCredits: Number(
              usedCredits.toFixed(4)
            ),

            creditsLeft: Number(
              creditsLeft.toFixed(4)
            ),

            currency:
              balanceData.currency || 'USD',

            usageType: 'All Time',
          };

        } catch (err) {
          logger.warn('[AdminRoute] Twilio usage lookup failed', {
            error: err?.response?.data || err.message,
          });
        }
      }

    return res.status(200).json({
      success: true,
      credits,
    });

  } catch (err) {
    logger.error('[AdminRoute] Failed to fetch credits', {
      error: err.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to fetch credits',
    });
  }
});




/**
 * GET /api/admin/outlets
 * List all outlets (active & inactive) for admin
 */
router.get('/outlets', async (req, res) => {
  try {
    const outlets = await outletRepo.getAllOutlets();
    
    // Dynamically aggregate review stats for Admin UI
    const db = require('../config/firebase').getDb();
    const reviewsSnap = await db.collection('reviews').get();
    
    const statsMap = {};
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    reviewsSnap.docs.forEach(doc => {
      const rev = doc.data();
      const outletId = rev.outletId;
      if (!outletId) return;
      if (!statsMap[outletId]) {
        statsMap[outletId] = {
          totalRating: 0,
          reviewCount: 0,
          thisMonthReviews: 0,
          pendingResponses: 0,
          negativeReviews: 0
        };
      }
      
      const st = statsMap[outletId];
      st.reviewCount++;
      const rating = Number(rev.rating || 0);
      st.totalRating += rating;
      
      const revTime = new Date(rev.reviewTimestamp || rev.createdAt || 0).getTime();
      if (now - revTime <= thirtyDaysMs) {
        st.thisMonthReviews++;
      }
      
      if (rating <= 2) {
        st.negativeReviews++;
      }
      
      const status = String(rev.status || '').toLowerCase();
      if (status === 'pending' || status === 'reply_pending' || status === 'suggested') {
        st.pendingResponses++;
      }
    });

    const enrichedOutlets = outlets.map(o => {
      const st = statsMap[o.id];
      if (!st) {
        return { 
          ...o, 
          reviewCount: 0, 
          avgRating: 0, 
          thisMonthReviews: 0, 
          pendingResponses: 0, 
          negativeReviews: 0, 
          reputationHealthScore: 'N/A' 
        };
      }
      
      const avg = st.reviewCount > 0 ? (st.totalRating / st.reviewCount).toFixed(1) : 0;
      let health = 'Good';
      if (avg >= 4.5) health = 'Excellent';
      else if (avg < 3.5) health = 'Poor';

      return {
        ...o,
        reviewCount: st.reviewCount,
        avgRating: Number(avg),
        thisMonthReviews: st.thisMonthReviews,
        pendingResponses: st.pendingResponses,
        negativeReviews: st.negativeReviews,
        reputationHealthScore: health
      };
    });

    res.status(200).json({ outlets: enrichedOutlets });
  } catch (err) {
    logger.error('[AdminRoute] Failed to fetch outlets', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch outlets.' });
  }
});


/**
 * DELETE /api/admin/logs/delete-old
 * Delete oldest activity logs
 */
router.delete('/logs/delete-old', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb();

    const limit = Math.min(
      parseInt(req.body.limit, 10) || 50,
      1000 // safety limit
    );

    logger.info('[AdminRoute] Bulk deleting old logs', {
      limit
    });

    /*
     * Fetch oldest logs first
     */
    const snapshot = await db
      .collection('activityLogs')
      .orderBy('timestamp', 'asc')
      .limit(limit)
      .get();

    if (snapshot.empty) {
      return res.status(200).json({
        success: true,
        deleted: 0,
        message: 'No logs found to delete',
      });
    }

    /*
     * Batch delete
     */
    const batch = db.batch();

    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    logger.info('[AdminRoute] Old logs deleted successfully', {
      deleted: snapshot.size,
    });

    return res.status(200).json({
      success: true,
      deleted: snapshot.size,
      message: `${snapshot.size} old logs deleted successfully`,
    });

  } catch (err) {
    logger.error('[AdminRoute] Failed to delete old logs', {
      error: err.message,
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to delete old logs',
    });
  }
});

/**
 * POST /api/admin/outlets
 * Create a new outlet
 */
router.post('/outlets', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb();
    const { admin: firebaseAdmin } = require('../config/firebase');
    const { email, ...outletData } = req.body;
    let authUid = null;

    if (email) {
      try {
        const existingUser = await firebaseAdmin.auth().getUserByEmail(email);
        authUid = existingUser.uid;
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          const createdUser = await firebaseAdmin.auth().createUser({
            email,
            emailVerified: true,
          });
          authUid = createdUser.uid;
        } else {
          throw err;
        }
      }
    }

    const { phone, ...restOutletData } = outletData;

    const id = await outletRepo.createOutlet({
      ...restOutletData,
      ...(phone ? { whatsappNumber: phone } : {}),
      ...(email ? { email } : {}),
      ...(authUid ? { ownerId: authUid } : {}),
    });

     // Trigger immediate review processing for the new outlet
    processSingleOutletReviewsImmediately(id).catch(err => {
      logger.error(`[AdminRoute] Failed to trigger immediate review processing for new outlet ${id}`, { error: err.message });
    });

    if (authUid) {
      await db.collection('users').doc(authUid).set(
        {
          email,
          outletId: id,
          role: 'outlet',
          businessName: outletData.name || outletData.placeName || '',
          isSetupComplete: true,
          createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    res.status(201).json({ id, message: 'Outlet created successfully' });
  } catch (err) {
    logger.error('[AdminRoute] Failed to create outlet', { error: err.message });
    res.status(500).json({ error: 'Failed to create outlet' });
  }
});

/**
 * GET /api/admin/places/autocomplete
 * Search possible business entries via Google Places autocomplete
 */
router.get('/places/autocomplete', async (req, res) => {
  try {
    const input = (req.query.input || '').trim();
    if (!input) {
      return res.status(400).json({ error: 'Missing input query' });
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/autocomplete/json', {
      params: {
        input,
        key: env.googlePlaces.apiKey,
        sessiontoken: req.query.sessiontoken || undefined,
        types: 'establishment',
        language: 'en',
      },
    });

    const status = response.data.status
    if (status !== 'OK' && status !== 'ZERO_RESULTS') {
      const errorMessage = response.data.error_message || status || 'Place autocomplete lookup failed'
      return res.status(400).json({ error: errorMessage })
    }

    const suggestions = (response.data.predictions || []).map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description,
      mainText: prediction.structured_formatting?.main_text,
      secondaryText: prediction.structured_formatting?.secondary_text,
    }));

    res.status(200).json({ suggestions });
  } catch (err) {
    const message = err.response?.data?.error_message || err.response?.data?.error || err.message || 'Failed to fetch place suggestions'
    logger.error('[AdminRoute] Failed to fetch place suggestions', { error: message, query: req.query.input });
    res.status(err.response?.status || 500).json({ error: message });
  }
});

/**
 * GET /api/admin/places/details
 * Resolve a Google Place ID into business details
 */
router.get('/places/details', async (req, res) => {
  try {
    const placeId = (req.query.placeId || '').trim();
    if (!placeId) {
      return res.status(400).json({ error: 'Missing placeId' });
    }

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', {
      params: {
        place_id: placeId,
        key: env.googlePlaces.apiKey,
        fields: 'place_id,name,formatted_address,international_phone_number,website,geometry,types',
        sessiontoken: req.query.sessiontoken || undefined,
      },
    });

    if (response.data.status !== 'OK') {
      return res.status(400).json({ error: response.data.error_message || response.data.status || 'Place details lookup failed' });
    }

    const result = response.data.result;
    res.status(200).json({
      place: {
        placeId: result.place_id,
        name: result.name,
        formatted_address: result.formatted_address,
        phone: result.international_phone_number || '',
        website: result.website || '',
        location: result.geometry?.location || null,
        types: result.types || [],
      },
    });
  } catch (err) {
    const message = err.response?.data?.error_message || err.response?.data?.error || err.message || 'Failed to fetch place details'
    logger.error('[AdminRoute] Failed to fetch place details', { error: message, placeId: req.query.placeId });
    res.status(err.response?.status || 500).json({ error: message });
  }
});

/**
 * PATCH /api/admin/outlets/:id/status
 * Toggle outlet active status
 */
router.patch('/outlets/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    await outletRepo.toggleOutletStatus(req.params.id, isActive);
    res.status(200).json({ message: `Outlet ${isActive ? 'activated' : 'deactivated'}` });
  } catch (err) {
    logger.error('[AdminRoute] Failed to toggle outlet status', { error: err.message });
    res.status(500).json({ error: 'Failed to update status' });
  }
});

/**
 * DELETE /api/admin/outlets/:id
 * Deactivate an outlet
 */
router.delete('/outlets/:id', async (req, res) => {
  try {
    await outletRepo.deactivateOutlet(req.params.id);
    res.status(200).json({ message: 'Outlet deactivated' });
  } catch (err) {
    logger.error('[AdminRoute] Failed to deactivate outlet', { error: err.message });
    res.status(500).json({ error: 'Failed to deactivate outlet' });
  }
});

/**
 * GET /api/admin/logs
 * Fetch system activity logs
 */
router.get('/logs', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb()

    const page = parseInt(req.query.page, 10) || 1
    const pageSize = parseInt(req.query.pageSize, 10) || 25

    const status = req.query.status || 'all'
    const search = (req.query.search || '').toLowerCase()

    let query = db
      .collection('activityLogs')
      .orderBy('timestamp', 'desc')

    /*
     * Status filter
     */
    if (status !== 'all') {
      const firestoreStatus =
        status === 'danger'
          ? 'error'
          : status

      query = query.where('status', '==', firestoreStatus)
    }

    /*
     * Fetch ALL filtered docs
     */
    const snapshot = await query.get()

    let logs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }))

    /*
     * Search filter
     */
    if (search) {
      logs = logs.filter((log) => {
        const eventType = log.eventType || ''

        const details =
          log.errorMessage ||
          log.payload?.message ||
          JSON.stringify(log.payload || {})

        return `${eventType} ${details}`
          .toLowerCase()
          .includes(search)
      })
    }

    /*
     * Pagination AFTER filtering
     */
    const total = logs.length

    const start = (page - 1) * pageSize
    const end = start + pageSize

    const paginatedLogs = logs.slice(start, end)

    return res.status(200).json({
      logs: paginatedLogs,
      total,
      totalPages: Math.ceil(total / pageSize),
      currentPage: page
    })

  } catch (err) {
    logger.error('[AdminRoute] Failed to fetch logs', {
      error: err.message
    })

    return res.status(500).json({
      error: 'Failed to fetch logs'
    })
  }
})
/**
 * POST /api/admin/trigger-cron
 */
router.post('/trigger-cron', async (req, res) => {
  try {
    const { triggerNow } = require('../jobs/reviewCron');
    triggerNow().catch((err) =>
      logger.error('[AdminRoute] Manual trigger failed', { error: err.message })
    );
    res.status(202).json({ message: 'Cron job triggered.' });
  } catch (err) {
    logger.error('[AdminRoute] Failed to trigger cron', { error: err.message });
    res.status(500).json({ error: 'Failed to trigger cron job.' });
  }
});

// ─── AI & Automation Usage Insights ──────────────────────────────────────────
router.get('/usage-insights', async (req, res) => {
  try {
    const { getDb } = require('../config/firebase');
    const db = getDb();

    // Fetch all required data to aggregate stats across the platform
    const [reviewsSnap, outletsSnap, customersSnap] = await Promise.all([
      db.collection('reviews').get(),
      db.collection('outlets').get(),
      db.collection('customers').get()
    ]);

    let aiResponsesGenerated = 0;
    let whatsappAlertsSent = 0;
    let failedAiResponses = 0; 
    let failedWhatsappAlerts = 0;
    let reviewSyncFailures = 0;

    const customerUsage = {}; 
    
    customersSnap.docs.forEach(doc => {
      const data = doc.data();
      customerUsage[doc.id] = {
        customerId: doc.id,
        name: data.name || 'Unknown',
        aiResponses: 0,
        whatsappAlerts: 0,
        cost: 0,
        monthlyFee: parseFloat(data.monthlyFee) || 0,
        status: data.accountStatus || 'Active'
      };
    });

    const outletToCustomer = {};
    outletsSnap.docs.forEach(doc => {
      outletToCustomer[doc.id] = doc.data().customerId;
    });

    reviewsSnap.docs.forEach(doc => {
      const rev = doc.data();
      const cId = outletToCustomer[rev.outletId];
      if (rev.aiResponse) {
        aiResponsesGenerated++;
        if (cId && customerUsage[cId]) {
          customerUsage[cId].aiResponses++;
          customerUsage[cId].cost += 0.01;
        }
      }
      if (rev.alertSentAt || rev.managerNotified || rev.escalation1Date) {
        whatsappAlertsSent++;
        if (cId && customerUsage[cId]) {
          customerUsage[cId].whatsappAlerts++;
          customerUsage[cId].cost += 0.05;
        }
      }
      if (rev.status === 'failed') failedAiResponses++;
    });

    const aiCostEstimate = aiResponsesGenerated * 0.01;
    const whatsappCostEstimate = whatsappAlertsSent * 0.05;

    const customerUsageArray = Object.values(customerUsage);
    
    const highUsageCustomers = [...customerUsageArray]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 5);

    const lowUsageCustomers = [...customerUsageArray]
      .filter(c => c.status === 'Active' && c.aiResponses === 0)
      .slice(0, 5);

    const marginRiskAccounts = [...customerUsageArray]
      .filter(c => c.monthlyFee > 0 && (c.cost / c.monthlyFee) > 0.5)
      .map(c => ({
        ...c,
        margin: `-${Math.round((c.cost / c.monthlyFee) * 100)}%`
      }));

    const usageInsights = {
      global: {
        aiResponsesGenerated,
        aiCostEstimate: parseFloat(aiCostEstimate.toFixed(2)),
        whatsappAlertsSent,
        whatsappCostEstimate: parseFloat(whatsappCostEstimate.toFixed(2)),
        failedAiResponses,
        failedWhatsappAlerts,
        reviewSyncFailures,
        automationSuccessRate: 99.8 
      },
      highUsageCustomers,
      lowUsageCustomers,
      marginRiskAccounts,
      adminAccounts: []
    };
    
    res.status(200).json(usageInsights);
  } catch (err) {
    logger.error('[AdminRoute] Failed to generate usage insights', { error: err.message });
    res.status(500).json({ error: 'Failed to generate usage insights', message: err.message });
  }
});

// ─── Reputation Intelligence Insights ────────────────────────────────────────
router.get('/reputation-insights', async (req, res) => {
  try {
    const { getDb } = require('../config/firebase');
    const db = getDb();
    
    const reviewsSnap = await db.collection('reviews').get();
    
    const categoryCounts = {};
    reviewsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.issueCategory) {
        categoryCounts[data.issueCategory] = (categoryCounts[data.issueCategory] || 0) + 1;
      }
    });

    const adminCategories = Object.entries(categoryCounts).map(([name, mentions], idx) => ({
      id: `CAT-${idx}`,
      name,
      mentions,
      trend: '0%', 
      status: 'Active'
    }));

    if (adminCategories.length === 0) {
      adminCategories.push({ id: 'CAT-1', name: 'Service Speed', mentions: 0, trend: '0%', status: 'Active' });
    }

    const reputationInsights = {
      alerts: [
        { id: 'AL-1', type: 'pattern', title: 'Monitoring issues', description: 'System is tracking new patterns.', severity: 'medium' }
      ],
      adminCategories,
      outletRisks: [],
      customerRisks: [],
      improvedOutlets: [],
      decliningOutlets: []
    };
    
    res.status(200).json(reputationInsights);
  } catch (err) {
    logger.error('[AdminRoute] Failed to generate reputation insights', { error: err.message });
    res.status(500).json({ error: 'Failed to generate reputation insights', message: err.message });
  }
});

// ─── Admin Update Actions ────────────────────────────────────────

/**
 * PATCH /api/admin/customers/:id
 * Update customer details
 */
router.patch('/customers/:id', async (req, res) => {
  try {
    const { admin: firebaseAdmin } = require('../config/firebase');
    const customerId = req.params.id;
    const updates = req.body;
    
    await require('../config/firebase').getDb().collection('customers').doc(customerId).update({
      ...updates,
      updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true, message: 'Customer updated successfully' });
  } catch (err) {
    logger.error('[AdminRoute] Failed to update customer', { error: err.message });
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

/**
 * PATCH /api/admin/outlets/:id/settings
 * Update outlet settings
 */
router.patch('/outlets/:id/settings', async (req, res) => {
  try {
    const { admin: firebaseAdmin } = require('../config/firebase');
    const outletId = req.params.id;
    const updates = req.body;
    
    await require('../config/firebase').getDb().collection('outlets').doc(outletId).update({
      ...updates,
      updatedAt: firebaseAdmin.firestore.FieldValue.serverTimestamp()
    });
    res.status(200).json({ success: true, message: 'Outlet settings updated successfully' });
  } catch (err) {
    logger.error('[AdminRoute] Failed to update outlet settings', { error: err.message });
    res.status(500).json({ error: 'Failed to update outlet settings' });
  }
});

/**
 * GET /api/admin/customers
 * Fetch all customers
 */
router.get('/customers', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb();
    const snap = await db.collection('customers').get();
    const customers = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(customers);
  } catch (err) {
    logger.error('[AdminRoute] Failed to fetch customers', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

/**
 * PATCH /api/admin/customers/:id
 * Update customer details
 */
router.patch('/customers/:id', async (req, res) => {
  try {
    const db = require('../config/firebase').getDb();
    const customerId = req.params.id;
    const updates = req.body;
    
    if (updates.id) delete updates.id;
    
    await db.collection('customers').doc(customerId).update({
      ...updates,
      updatedAt: new Date()
    });
    
    res.json({ success: true });
  } catch (err) {
    logger.error('[AdminRoute] Failed to update customer', { error: err.message, id: req.params.id });
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

module.exports = router;
