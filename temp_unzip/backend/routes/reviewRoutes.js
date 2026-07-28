/**
 * routes/reviewRoutes.js
 */

'use strict';

const express = require('express');
const router = express.Router();
const reviewRepo = require('../repositories/reviewRepo');
const logger = require('../utils/logger');
const { STATUS, normalizeStatus } = require('../utils/reviewStatus');

/**
 * GET /api/reviews
 * Fetch all reviews (optionally filtered by outletId)
 */
router.get('/', async (req, res) => {
  try {
    const { outletId, limit, status, rating, search, page } = req.query;
    const db = require('../config/firebase').getDb();
    let query = db.collection('reviews');

    // Filter by outletId in Firestore (if provided)
    if (outletId) {
      query = query.where('outletId', '==', outletId);
    }

    const [snap, outletsSnap] = await Promise.all([
      query.get(),
      db.collection('outlets').get(),
    ]);

    const outletMap = {};
    outletsSnap.docs.forEach((doc) => {
      outletMap[doc.id] = doc.data();
    });

    let reviews = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
      };
    });

    // Compute status counts (before filtering and paging)
    const counts = {
      all: reviews.length,
      pending: 0,
      suggested: 0,
      responded: 0,
      escalated: 0,
      failed: 0,
    };

    reviews.forEach((r) => {
      const statusVal = normalizeStatus(r.status || STATUS.PENDING);
      if (counts[statusVal] !== undefined) {
        counts[statusVal]++;
      }
    });

    // 1. Filter by status
    if (status && status !== 'all') {
      reviews = reviews.filter(
        (r) => normalizeStatus(r.status || STATUS.PENDING) === normalizeStatus(status)
      );
    }

    // 2. Filter by rating
    if (rating && rating !== 'all') {
      if (rating === '4+') {
        reviews = reviews.filter((r) => Number(r.rating || 0) >= 4);
      } else if (rating === '3+') {
        reviews = reviews.filter((r) => Number(r.rating || 0) >= 3);
      } else if (rating === '1-2') {
        reviews = reviews.filter((r) => Number(r.rating || 0) <= 2);
      } else {
        const ratingNum = Number(rating);
        if (!Number.isNaN(ratingNum)) {
          reviews = reviews.filter((r) => Number(r.rating || 0) === ratingNum);
        }
      }
    }

    // 3. Filter by search
    if (search) {
      const q = search.toLowerCase();
      reviews = reviews.filter(
        (r) =>
          (r.customerName || '').toLowerCase().includes(q) ||
          (r.text || '').toLowerCase().includes(q) ||
          (outletMap[r.outletId]?.name || '').toLowerCase().includes(q)
      );
    }

    // 4. Sort by createdAt desc
    reviews.sort((a, b) => {
      const timeA = a.createdAt
        ? a.createdAt.toDate
          ? a.createdAt.toDate().getTime()
          : new Date(a.createdAt).getTime()
        : 0;
      const timeB = b.createdAt
        ? b.createdAt.toDate
          ? b.createdAt.toDate().getTime()
          : new Date(b.createdAt).getTime()
        : 0;
      return timeB - timeA;
    });

    // 5. Pagination
    const total = reviews.length;
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const totalPages = Math.ceil(total / limitNum);
    const start = (pageNum - 1) * limitNum;
    const end = start + limitNum;

    const paginatedReviews = reviews.slice(start, end).map((r) => {
      const statusVal = normalizeStatus(r.status || STATUS.PENDING);
      return {
        ...r,
        status: statusVal,
        requiresManualReply: statusVal === STATUS.SUGGESTED,
        isEscalated: statusVal === STATUS.ESCALATED,
        hasFailed: statusVal === STATUS.FAILED,
      };
    });

    res.status(200).json({
      data: paginatedReviews,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages,
      },
      counts,
    });
  } catch (err) {
    logger.error('[ReviewRoute] Failed to fetch reviews', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

/**
 * GET /api/escalations
 * Fetch all escalated reviews
 */
router.get('/escalations', async (req, res) => {
  try {
    const { outletId } = req.query;
    const db = require('../config/firebase').getDb();
    let query = db.collection('reviews').where('status', '==', 'escalated');

    if (outletId) {
      query = query.where('outletId', '==', outletId);
    }

    const snap = await query.orderBy('createdAt', 'desc').get();
    const escalations = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        requiresManualReply: false,
        isEscalated: true,
        hasFailed: false,
      };
    });

    res.status(200).json(escalations);
  } catch (err) {
    logger.error('[ReviewRoute] Failed to fetch escalations', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch escalations' });
  }
});

/**
 * GET /api/analytics/summary
 * Fetch analytics summary
 */
router.get('/analytics/summary', async (req, res) => {
  try {
    const { outletId } = req.query;
    // This would typically involve complex aggregation.
    // For now, we'll return some semi-mocked data based on real counts if possible.
    const db = require('../config/firebase').getDb();
    
    let baseQuery = db.collection('reviews');
    if (outletId) {
      baseQuery = baseQuery.where('outletId', '==', outletId);
    }

    const totalSnap = await baseQuery.count().get();
    const totalReviews = totalSnap.data().count;

    const respondedSnap = await baseQuery.where('status', '==', STATUS.RESPONDED).count().get();
    const totalResponded = respondedSnap.data().count;

    const escalatedSnap = await baseQuery.where('status', '==', STATUS.ESCALATED).count().get();
    const totalEscalated = escalatedSnap.data().count;

    const suggestedSnap = await baseQuery.where('status', '==', STATUS.SUGGESTED).count().get();
    const legacySuggestedSnap = await baseQuery.where('status', '==', 'reply_pending').count().get();
    const totalSuggested = suggestedSnap.data().count + legacySuggestedSnap.data().count;

    const pendingSnap = await baseQuery.where('status', '==', STATUS.PENDING).count().get();
    const totalPending = pendingSnap.data().count;

    const failedSnap = await baseQuery.where('status', '==', STATUS.FAILED).count().get();
    const totalFailed = failedSnap.data().count;

    // Return a structure that matches what the frontend expects
    res.status(200).json({
      totalReviews,
      totalResponded,
      totalEscalated,
      totalSuggested,
      totalPending,
      totalFailed,
      avgRating: 4.5, // Mocked for now
      sentiment: {
        positive: 75,
        neutral: 15,
        negative: 10
      },
      weeklyTrend: [
        { name: 'Mon', reviews: 10, responses: 8 },
        { name: 'Tue', reviews: 15, responses: 12 },
        { name: 'Wed', reviews: 8, responses: 8 },
        { name: 'Thu', reviews: 20, responses: 18 },
        { name: 'Fri', reviews: 25, responses: 22 },
        { name: 'Sat', reviews: 30, responses: 28 },
        { name: 'Sun', reviews: 22, responses: 20 },
      ]
    });
  } catch (err) {
    logger.error('[ReviewRoute] Failed to fetch analytics', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
