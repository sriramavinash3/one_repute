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
      },

      apify: {
        monthlyUsageUsd: null,
        maxMonthlyUsageUsd: null,
        remainingUsd: null,
      },
    };

    /*
     * =========================================================
     * APIFY
     * =========================================================
     */

    if (env.apify && env.apify.token) {
      try {
        const apifyResp = await axios.get(
          'https://api.apify.com/v2/users/me/limits',
          {
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${env.apify.token}`,
            },
            timeout: 10000,
          }
        );

        const limitsData = apifyResp?.data?.data || {};

        const current = limitsData.current || {};
        const limits = limitsData.limits || {};

        const usedCredits =
          current.monthlyUsageUsd || 0;

        const totalCredits =
          limits.maxMonthlyUsageUsd || 0;

        const creditsLeft =
          totalCredits - usedCredits;

        credits.apify = {
          usedCredits: Number(
            usedCredits.toFixed(4)
          ),

          creditsLeft: Number(
            creditsLeft.toFixed(4)
          ),

          totalCredits: Number(
            totalCredits.toFixed(2)
          ),

          usageType: 'Monthly',

          cycle: {
            start:
              limitsData.monthlyUsageCycle?.startAt || null,

            end:
              limitsData.monthlyUsageCycle?.endAt || null,
          },
        };

      } catch (err) {
        logger.warn('[AdminRoute] Apify credits lookup failed', {
          error: err?.response?.data || err.message,
        });
      }
    }



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
    res.status(200).json({ outlets });
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

module.exports = router;
