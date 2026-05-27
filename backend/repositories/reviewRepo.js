/**
 * repositories/reviewRepo.js
 *
 * All Firestore operations for /reviews and /logs collections.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');
const { STATUS, canTransition, normalizeStatus, isValidStatus } = require('../utils/reviewStatus');

const REVIEWS = 'reviews';
const ACTIVITY_LOGS = 'activityLogs';

/**
 * Check whether a review already exists by its reviewId.
 * Used for deduplication before processing.
 *
 * @param {string} reviewId
 * @returns {Promise<boolean>}
 */
async function reviewExists(reviewId) {
  const db = getDb();
  const snap = await db
    .collection(REVIEWS)
    .where('reviewId', '==', reviewId)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Check whether a review exists by provider review ID + placeId.
 *
 * @param {string} placeId
 * @param {string} providerReviewId
 * @returns {Promise<boolean>}
 */
async function reviewExistsByProviderReviewId(placeId, providerReviewId) {
  if (!placeId || !providerReviewId) return false;
  const db = getDb();
  const snap = await db
    .collection(REVIEWS)
    .where('placeId', '==', placeId)
    .where('providerReviewId', '==', providerReviewId)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Save a new review with status = 'pending'.
 *
 * @param {Object} reviewData
 * @returns {Promise<string>} - Firestore document ID
 */
async function saveReview(reviewData) {
  const db = getDb();
  let reviewTimestamp = null;
  if (reviewData.reviewTimestamp) {
    const parsed = new Date(reviewData.reviewTimestamp);
    if (!Number.isNaN(parsed.getTime())) {
      reviewTimestamp = admin.firestore.Timestamp.fromDate(parsed);
    }
  }
  const payload = {
    ...reviewData,
    status: STATUS.PENDING,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    processedAt: null,
    lastProcessedAt: null,
    aiResponse: null,
    replySuggestion: reviewData.replySuggestion || null,
    placeId: reviewData.placeId || null,
    providerSource: reviewData.providerSource || null,
    providerReviewId: reviewData.providerReviewId || null,
    reviewTimestamp,
    sentiment: reviewData.sentiment || null,
    tags: reviewData.tags || [],
    aiSummary: reviewData.aiSummary || null,
    failureReason: null,
    repliedAt: null,
    alertSentAt: null,
    escalationLevel: null,
    managerNotified: null,
    retryCount: 0,
    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
    isDeletedOnSource: false,
  };

  // If caller provided a deterministic reviewId (hash), use it as the document ID
  if (reviewData.reviewId) {
    const docRef = db.collection(REVIEWS).doc(reviewData.reviewId);
    try {
      // Use create() to ensure we don't overwrite an existing document — this will throw if doc exists
      await docRef.create(payload);
      return docRef.id;
    } catch (err) {
      // If document already exists, return its id and do not insert a duplicate
      logger.warn('[ReviewRepo] saveReview: review already exists, skipping insert', { reviewId: reviewData.reviewId, error: err.message });
      return docRef.id;
    }
  }

  const ref = await db.collection(REVIEWS).add(payload);
  return ref.id;
}

/**
 * Centralized status updater with transition validation.
 *
 * @param {string} docId
 * @param {string} status
 * @param {Object} metadata
 * @returns {Promise<void>}
 */
async function updateReviewStatus(docId, status, metadata = {}) {
  const db = getDb();
  if (!isValidStatus(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  const nextStatus = normalizeStatus(status);

  await db.runTransaction(async (tx) => {
    const ref = db.collection(REVIEWS).doc(docId);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new Error(`Review document not found: ${docId}`);
    }

    const data = snap.data() || {};
    const currentStatus = normalizeStatus(data.status || STATUS.PENDING);

    if (!canTransition(currentStatus, nextStatus)) {
      throw new Error(`Invalid status transition: ${currentStatus} -> ${nextStatus}`);
    }

    const updatePayload = {
      status: nextStatus,
      lastProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...metadata,
    };

    tx.update(ref, updatePayload);
  });
}

/**
 * Mark a review as 'responded' after a successful AI reply was posted.
 *
 * @param {string} docId      - Firestore document ID
 * @param {string} aiResponse - The AI-generated reply text
 */
async function markAsResponded(docId, aiResponse) {
  await updateReviewStatus(docId, STATUS.RESPONDED, {
    aiResponse,
    replySuggestion: aiResponse,
    repliedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Mark a review as 'escalated' after a WhatsApp alert was sent.
 *
 * @param {string} docId
 * @param {string} aiResponse - AI-suggested reply (for manager reference)
 */
async function markAsEscalated(docId, aiResponse) {
  await updateReviewStatus(docId, STATUS.ESCALATED, {
    aiResponse,
    replySuggestion: aiResponse || null,
    alertSentAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Mark a review as pending reply (scraper mode).
 *
 * @param {string} docId
 * @param {string} aiResponse
 */
async function markAsSuggested(docId, aiResponse) {
  await updateReviewStatus(docId, STATUS.SUGGESTED, {
    aiResponse,
    replySuggestion: aiResponse || null,
  });
}

/**
 * Mark a review as 'failed' when all retries are exhausted.
 *
 * @param {string} docId
 * @param {string} errorMessage
 */
async function markAsFailed(docId, errorMessage) {
  await updateReviewStatus(docId, STATUS.FAILED, {
    failureReason: errorMessage,
    errorMessage,
    failedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Fetch all pending reviews for a given outlet.
 * Used to resume after a crash — reprocess anything stuck in 'pending'.
 *
 * @param {string} outletId
 * @returns {Promise<Array>}
 */
async function getPendingReviews(outletId) {
  const db = getDb();
  const snap = await db
    .collection(REVIEWS)
    .where('outletId', '==', outletId)
    .where('status', '==', STATUS.PENDING)
    .get();
  return snap.docs.map((doc) => ({ docId: doc.id, ...doc.data() }));
}

// ─── Logging ─────────────────────────────────────────────────────────────────

/**
 * Write a structured log entry to /logs.
 * Called for every significant event (success, failure, retry, etc.)
 *
 * @param {Object} entry
 * @param {string} entry.eventType    - e.g. 'REVIEW_FETCHED', 'AI_REPLY_FAILED'
 * @param {string} entry.status       - 'success' | 'error' | 'warning'
 * @param {Object} [entry.payload]    - Contextual data (outletId, reviewId, etc.)
 * @param {string} [entry.errorMessage]
 * @param {string} [entry.stackTrace]
 */
async function writeLog(entry) {
  const db = getDb();
  try {
    await db.collection(ACTIVITY_LOGS).add({
      eventType: entry.eventType,
      status: entry.status,
      payload: entry.payload || {},
      providerSource: entry.providerSource || null,
      retryCount: entry.retryCount || 0,
      errorMessage: entry.errorMessage || null,
      stackTrace: entry.stackTrace || null,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Don't crash if logging itself fails — log to console as last resort
    logger.error('[ReviewRepo] Failed to write log entry', { error: err.message });
  }
}

module.exports = {
  STATUS,
  reviewExists,
  reviewExistsByProviderReviewId,
  saveReview,
  updateReviewStatus,
  markAsResponded,
  markAsEscalated,
  markAsSuggested,
  markAsFailed,
  getPendingReviews,
  writeLog,
};
