/**
 * app.js
 *
 * Express application setup:
 *  - Security middleware
 *  - Rate limiting
 *  - API routes (health, admin triggers)
 *  - Global error handler
 */

'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const logger = require('./utils/logger');
const cors = require('cors');

const app = express();

// CORS middleware to allow requests from frontend
const corsOptions = {
  origin: 'http://localhost:5173', // Update this to match your frontend's URL
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// ─── Security Middleware ──────────────────────────────────────────────────────

// Set security headers (CSP, HSTS, X-Frame-Options, etc.)
app.use(helmet());

// Parse JSON bodies (max 10kb to prevent large payload attacks)
app.use(express.json({ limit: '10kb' }));

// Trust proxy for correct IP in rate limiter when behind load balancer
app.set('trust proxy', 1);

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const limiter = rateLimit({
  windowMs: env.rateLimit.windowMs,
  max: env.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later.' },
  handler: (req, res, next, options) => {
    logger.warn('[RateLimit] Limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json(options.message);
  },
});

app.use('/api/', limiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 * Health check for load balancers and uptime monitors.
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

// Import modular routers
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const outletRoutes = require('./routes/outletRoutes');
const reviewRoutes = require('./routes/reviewRoutes');

// Use routers
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/outlets', outletRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/analytics', reviewRoutes); // Analytics are shared with review routes for now

// Google Specific Sync (Legacy or specialized)
app.post('/api/google/sync-business-data', async (req, res) => {
  try {
    const { outletId, forceRefresh } = req.body;
    if (!outletId) {
      return res.status(400).json({ error: 'Missing outletId' });
    }

    const outletRepo = require('./repositories/outletRepo');
    const googleOAuth = require('./services/googleOAuthService');

    // 1. Check cache first unless forceRefresh is true
    if (!forceRefresh) {
      const cached = await outletRepo.getCachedGoogleBusinessData(outletId);
      const outlet = await outletRepo.getOutletById(outletId);

      const lastCached = outlet?.googleBusinessDataCachedAt?.toDate();
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      if (cached && cached.locations?.length > 0 && lastCached > oneDayAgo) {
        logger.info('[GoogleSync] Returning cached business data', { outletId });
        return res.status(200).json({
          message: 'Business data retrieved from cache',
          accountId: cached.googleAccountId,
          locations: cached.locations,
          cachedAt: lastCached,
        });
      }
    }

    // 2. Fetch from Google if cache is stale or missing
    const outlet = await outletRepo.getOutletById(outletId);
    if (!outlet) {
      return res.status(404).json({ error: 'Outlet not found' });
    }

    if (!outlet.googleRefreshToken) {
      return res.status(400).json({ error: 'Google account not connected for this outlet' });
    }

    const oauth2Client = googleOAuth.createOAuthClient(outlet);
    const { accountId, locations } = await googleOAuth.fetchAccountsAndLocations(oauth2Client);

    // 3. Update cache
    await outletRepo.cacheGoogleBusinessData(outletId, {
      googleAccountId: accountId,
      locations,
    });

    await outletRepo.logActivity('SYNC_BUSINESS_DATA', {
      outletId,
      accountId,
      locationCount: locations.length,
      status: 'success',
    });

    res.status(200).json({
      message: 'Business data synced successfully',
      accountId,
      locations,
    });
  } catch (err) {
    logger.error('[GoogleSync] Failed to sync business data', { error: err.message });

    const outletRepo = require('./repositories/outletRepo');
    await outletRepo.logActivity('SYNC_BUSINESS_DATA_FAILED', {
      outletId: req.body.outletId,
      error: err.message,
      status: 'error',
    });

    res.status(500).json({ error: 'Failed to sync business data' });
  }
});

// ─── Test Route ───────────────────────────────────────────────────────────────

/**
 * GET /api/test-route
 * Endpoint to test the full review processing pipeline with static data.
 * Usage: /api/test-route?rating=2 (for WhatsApp) or /api/test-route?rating=5 (for AI reply)
 */
app.get('/api/test-route', async (req, res) => {
  try {
    const outletRepo = require('./repositories/outletRepo');
    const reviewRepo = require('./repositories/reviewRepo');
    const reviewService = require('./services/reviewService');
    const logger = require('./utils/logger');

    // 1. Fetch first active outlet from Firestore
    const outlets = await outletRepo.getActiveOutlets();
    if (!outlets || outlets.length === 0) {
      return res.status(404).json({ error: 'No active outlets found in database to test with.' });
    }
    const outlet = outlets[0];

    // Dynamic selection: backend uses the threshold stored in the outlet document
    const threshold = parseInt(outlet.escalationThreshold) || 3;
    const rating = req.query.rating ? parseInt(req.query.rating) : 3;
    const isPositive = rating > threshold;

    const sampleReview = {
      reviewId: 'test-' + Date.now(),
      customerName: 'Test User',
      rating: rating,
      text: isPositive 
        ? 'Amazing experience! The ambiance and food were top-notch. Highly recommended!' 
        : 'Disappointing service today. We had to wait 40 minutes for our drinks.',
      rawName: `accounts/test/locations/test/reviews/test-${Date.now()}`,
    };

    logger.info('[TestRoute] Starting test run', {
      outletId: outlet.id,
      rating: sampleReview.rating,
      threshold,
      isPositive
    });

    // 3. Save to Firestore as 'pending' to get a valid docId for updates
    const docId = await reviewRepo.saveReview({
      reviewId: sampleReview.reviewId,
      outletId: outlet.id,
      customerName: sampleReview.customerName,
      rating: sampleReview.rating,
      text: sampleReview.text,
      rawName: sampleReview.rawName,
    });

    // 4. Trigger the processing pipeline
    // This will generate AI reply, post to Google or send WhatsApp alert based on rating
    await reviewService.processReviewWithSafety(outlet, {
      ...sampleReview,
      reviewText: sampleReview.text,
      docId
    });

    const willPostReply = isPositive && outlet.providerType === 'GBP';
    const action = isPositive
      ? (willPostReply ? 'AI Response / Google Reply' : 'AI Suggestion')
      : 'WhatsApp Escalation';

    res.status(200).json({
      message: 'Test route processing completed.',
      details: {
        outletName: outlet.name,
        outletId: outlet.id,
        reviewDocId: docId,
        rating: sampleReview.rating,
        action,
      },
      note: 'Check the server logs or Firestore activityLogs/reviews for execution details.'
    });

  } catch (err) {
    logger.error('[TestRoute] Execution failed', { error: err.message });
    res.status(500).json({
      error: 'Test route failed',
      message: err.message
    });
  }
});

/**
 * GET /api/test-live-reviews
 * Fetch real reviews for active outlets from Firestore/provider and process them
 * through the AI + escalation flow.
 *
 * Query params:
 *   - outletId (optional): process a single active outlet
 *   - limit (optional): max number of active outlets to process
 */
app.get('/api/test-live-reviews', async (req, res) => {
  try {
    const outletRepo = require('./repositories/outletRepo');
    const reviewService = require('./services/reviewService');

    const activeOutlets = await outletRepo.getActiveOutlets();
    if (!activeOutlets || activeOutlets.length === 0) {
      return res.status(404).json({ error: 'No active outlets found in Firestore.' });
    }

    const { outletId } = req.query;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    let outletsToProcess = activeOutlets;

    if (outletId) {
      outletsToProcess = activeOutlets.filter((outlet) => outlet.id === outletId);
      if (outletsToProcess.length === 0) {
        return res.status(404).json({
          error: 'Active outlet not found for provided outletId.',
          outletId,
        });
      }
    }

    if (Number.isInteger(limit) && limit > 0) {
      outletsToProcess = outletsToProcess.slice(0, limit);
    }

    const results = [];
    const totals = {
      fetched: 0,
      new: 0,
      processed: 0,
      failedOutlets: 0,
    };

    for (const outlet of outletsToProcess) {
      try {
        const summary = await reviewService.processOutletReviews(outlet, {
          skipCooldown: true,
        });

        totals.fetched += summary.fetched || 0;
        totals.new += summary.new || 0;
        totals.processed += summary.processed || 0;

        results.push({
          outletId: outlet.id,
          outletName: outlet.name,
          providerType: outlet.providerType || 'APIFY',
          status: 'success',
          ...summary,
        });
      } catch (err) {
        totals.failedOutlets += 1;

        logger.error('[TestLiveReviews] Outlet processing failed', {
          outletId: outlet.id,
          error: err.message,
        });

        results.push({
          outletId: outlet.id,
          outletName: outlet.name,
          providerType: outlet.providerType || 'APIFY',
          status: 'error',
          error: err.message,
          fetched: 0,
          new: 0,
          processed: 0,
        });
      }
    }

    res.status(200).json({
      message: 'Live review test route completed.',
      filters: {
        outletId: outletId || null,
        limit: Number.isInteger(limit) && limit > 0 ? limit : null,
      },
      totals,
      outletCount: {
        activeInFirestore: activeOutlets.length,
        processed: outletsToProcess.length,
      },
      results,
      note: 'This route fetches real reviews from each outlet provider and applies AI reply/WhatsApp escalation based on rating thresholds.',
    });
  } catch (err) {
    logger.error('[TestLiveReviews] Execution failed', { error: err.message });
    res.status(500).json({
      error: 'Live review test route failed',
      message: err.message,
    });
  }
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

// Must have exactly 4 parameters for Express to treat it as error middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('[GlobalErrorHandler] Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.statusCode || err.status || 500;
  const message = env.NODE_ENV === 'production'
    ? 'An internal error occurred.'
    : err.message;

  res.status(statusCode).json({ error: message });
});

module.exports = app;
