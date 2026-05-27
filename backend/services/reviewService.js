/**
 * services/reviewService.js
 *
 * Core orchestrator for the review automation pipeline.
 *
 * For each outlet:
 *   1. Fetch reviews from Google
 *   2. Deduplicate
 *   3. Save new reviews as 'pending'
 *   4. Process in parallel batches:
 *      - Rating ≥ 4: generate AI reply → post to Google → mark 'responded'
 *      - Rating ≤ 3: generate AI suggestion → send WhatsApp → mark 'escalated'
 *   5. Log all outcomes to Firestore /logs
 */

'use strict';

const openaiService = require('./openaiService');
const whatsappService = require('./whatsappService');
const reviewRepo = require('../repositories/reviewRepo');
const outletRepo = require('../repositories/outletRepo');
const env = require('../config/env');
const logger = require('../utils/logger');
const { getReviewProvider } = require('../providers/providerFactory');
const { validateNormalizedReview } = require('../utils/validator');
const { computeReviewHash } = require('../utils/reviewHash');
const { STATUS } = require('../utils/reviewStatus');

// ─── Process a Single Review ──────────────────────────────────────────────────

/**
 * Process one review end-to-end: generate AI reply, post or escalate, update status.
 *
 * @param {Object} outlet    - Outlet document
 * @param {string} docId     - Firestore document ID for this review
 * @param {Object} review    - Validated + sanitized review data
 */
async function processSingleReview(outlet, docId, review) {
  await processReviewWithSafety(outlet, { ...review, docId });
}

// ─── Process All Reviews for One Outlet ──────────────────────────────────────

/**
 * Fetch, deduplicate, save, and process all new reviews for one outlet.
 *
 * @param {Object} outlet
 * @param {Object} [options]
 * @param {boolean} [options.skipCooldown=false]
 * @param {boolean} [options.skipDeduplication=false]
 * @returns {Promise<{ fetched: number, new: number, processed: number }>}
 */
async function processOutletReviews(outlet, options = {}) {
  logger.info('[ReviewService] Processing outlet', { outletId: outlet.id, name: outlet.name });

  const provider = getReviewProvider(outlet);
  const providerOutlet = resolveOutletForProvider(outlet, provider);
  const skipCooldown = options.skipCooldown === true;
  const skipDeduplication = options.skipDeduplication === true;

  // 1. Cooldown check
  if (!skipCooldown) {
    const cooldownMinutes = Number(outlet.syncCooldownMinutes || env.scraper.cooldownMinutes);
    const lastFetchAt = toDate(outlet.lastReviewFetchAt);
    if (lastFetchAt) {
      const elapsedMs = Date.now() - lastFetchAt.getTime();
      if (elapsedMs < cooldownMinutes * 60 * 1000) {
        logger.info('[ReviewService] Cooldown active - skipping fetch', {
          outletId: outlet.id,
          cooldownMinutes,
          elapsedMinutes: Math.round(elapsedMs / 60000),
        });
        return { fetched: 0, new: 0, processed: 0 };
      }
    }
  }

  // 2. Fetch reviews from provider
  let providerReviews;
  try {
    providerReviews = await provider.fetchReviews(providerOutlet, {
      maxReviews: env.scraper.maxReviews,
    });
  } catch (err) {
    logger.error('[ReviewService] Failed to fetch reviews from provider', {
      outletId: outlet.id,
      providerType: provider.providerType,
      error: err.message,
    });
    await reviewRepo.writeLog({
      eventType: 'REVIEW_FETCH_FAILED',
      status: 'error',
      providerSource: provider.providerType,
      payload: { outletId: outlet.id },
      errorMessage: err.message,
      stackTrace: err.stack,
    });
    return { fetched: 0, new: 0, processed: 0 };
  }

  const fetched = providerReviews.length;
  const toProcess = [];
  const knownHashes = skipDeduplication
    ? new Set()
    : new Set(Array.isArray(outlet.fetchedReviewHashes) ? outlet.fetchedReviewHashes : []);
  let latestReviewTimestamp = toDate(outlet.latestReviewTimestamp);
  let existingHits = 0;

  // 3. Sort newest-first for early stop
  const sorted = providerReviews.sort((a, b) => {
    const aTime = new Date(a.reviewTimestamp || 0).getTime();
    const bTime = new Date(b.reviewTimestamp || 0).getTime();
    return bTime - aTime;
  });

  for (const raw of sorted) {
    const { valid, errors, review } = validateNormalizedReview(raw);
    if (!valid) {
      logger.warn('[ReviewService] Skipping invalid review', { outletId: outlet.id, errors });
      continue;
    }

    const reviewHash = computeReviewHash({
      placeId: review.placeId,
      customerName: review.customerName,
      text: review.text,
      rating: review.rating,
      reviewTimestamp: review.reviewTimestamp,
    });

    const knownByHash = skipDeduplication ? false : knownHashes.has(reviewHash);
    const knownByProvider = skipDeduplication
      ? false
      : await reviewRepo.reviewExistsByProviderReviewId(review.placeId, review.providerReviewId);
    const knownByReviewId = skipDeduplication ? false : await reviewRepo.reviewExists(reviewHash);

    if (knownByHash || knownByProvider || knownByReviewId) {
      existingHits += 1;
      if (!skipDeduplication && existingHits >= env.scraper.stopOnExistingCount) {
        break;
      }
      continue;
    }

    const docId = await reviewRepo.saveReview({
      reviewId: reviewHash,
      outletId: outlet.id,
      placeId: review.placeId,
      providerSource: review.providerSource,
      providerReviewId: review.providerReviewId,
      reviewTimestamp: review.reviewTimestamp,
      customerName: review.customerName,
      reviewerPhotoURL: review.reviewerPhotoURL || null,
      reviewUrl: review.reviewUrl || null,
      rating: review.rating,
      text: review.text,
      rawName: review.rawName || null,
    });

    knownHashes.add(reviewHash);

    if (review.reviewTimestamp) {
      const ts = new Date(review.reviewTimestamp);
      if (!latestReviewTimestamp || ts > latestReviewTimestamp) {
        latestReviewTimestamp = ts;
      }
    }

    toProcess.push({
      docId,
      review: {
        ...review,
        reviewId: reviewHash,
        reviewText: review.text,
      },
    });
  }

  await outletRepo.updateReviewSyncState(outlet.id, {
    lastReviewFetchAt: new Date(),
    latestReviewTimestamp: latestReviewTimestamp || null,
    fetchedReviewHashes: Array.from(knownHashes).slice(-env.scraper.maxHashHistory),
    providerType: outlet.providerType || provider.providerType,
  });

  logger.info('[ReviewService] New reviews to process', {
    outletId: outlet.id,
    fetched,
    new: toProcess.length,
  });

  if (toProcess.length === 0) {
    return { fetched, new: 0, processed: 0 };
  }

  // 4. Process sequentially with randomized delays to respect provider quotas
  let processed = 0;

  for (const item of toProcess) {
    try {
      await processReviewWithSafety(outlet, { ...item.review, docId: item.docId }, provider);
      processed++;
      await randomDelay(3000, 12000);
    } catch (err) {
      logger.error('[ReviewService] Sequential processing error', {
        outletId: outlet.id,
        reviewId: item.review.reviewId,
        error: err.message,
      });
    }
  }

  return { fetched, new: toProcess.length, processed };
}

// Utility function to introduce a randomized delay
function randomDelay(min = 3000, max = 12000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Sequentially process reviews with throttling.
 * @param {Array} reviews - List of reviews to process.
 * @param {Function} processReview - Function to process a single review.
 */
async function processReviewsSequentially(reviews, processReview) {
  for (const review of reviews) {
    await processReview(review);
    await randomDelay(); // Add randomized delay between processing
  }
}

/**
 * Process reviews based on rating with human-safe automation.
 * @param {Object} outlet - Outlet document.
 * @param {Object} review - Review data.
 */
async function processReviewWithSafety(outlet, review, providerOverride) {
  const { rating, reviewText, customerName, reviewId, docId } = review;
  const provider = providerOverride || getReviewProvider(outlet);

  const escalationThreshold = parseInt(outlet.escalationThreshold) || 3;

  try {
    const isPositive = rating > escalationThreshold;
    const isEscalation = rating <= escalationThreshold;

    let aiResponse = null;

    if (isPositive) {
      aiResponse = await openaiService.generateReply({
        outletName: outlet.name,
        customerName,
        rating,
        reviewText,
        type: 'positive',
      });
    }

    if (isPositive) {
      if (provider.supportsReply && outlet.providerType === 'GBP') {
        await provider.postReply(outlet, review, aiResponse);
        await reviewRepo.updateReviewStatus(docId, STATUS.RESPONDED, {
          aiResponse,
          replySuggestion: aiResponse,
          repliedAt: new Date(),
          providerResponseId: null,
          responseMetadata: null,
        });
        await reviewRepo.writeLog({
          eventType: 'REVIEW_RESPONDED',
          status: 'success',
          providerSource: provider.providerType,
          payload: { outletId: outlet.id, reviewId, rating, aiResponseLength: aiResponse.length },
        });
        logger.info('[ReviewService] Positive review handled', { outletId: outlet.id, reviewId, rating });
      } else {
        await reviewRepo.updateReviewStatus(docId, STATUS.SUGGESTED, {
          aiResponse,
          replySuggestion: aiResponse || null,
        });
        await reviewRepo.writeLog({
          eventType: 'REVIEW_SUGGESTED',
          status: 'success',
          providerSource: provider.providerType,
          payload: { outletId: outlet.id, reviewId, rating, reason: 'Scraper mode or provider does not support reply' },
        });
        logger.info('[ReviewService] Reply saved for posting', { outletId: outlet.id, reviewId, rating });
      }
    } else if (isEscalation) {
      await whatsappService.sendNegativeReviewAlert({
        toNumber: outlet.whatsappNumber,
        outletName: outlet.name,
        rating,
        reviewText,
        customerName,
      });

      await reviewRepo.updateReviewStatus(docId, STATUS.ESCALATED, {
        aiResponse: null,
        replySuggestion: null,
        alertSentAt: new Date(),
        escalationLevel: rating <= 1 ? 'urgent' : rating === 2 ? 'high' : 'medium',
        managerNotified: true,
      });
      await reviewRepo.writeLog({
        eventType: 'REVIEW_ESCALATED',
        status: 'success',
        providerSource: provider.providerType,
        payload: { outletId: outlet.id, reviewId, rating },
      });

      logger.info('[ReviewService] Review escalated', { outletId: outlet.id, reviewId, rating });
    }
  } catch (err) {
    logger.error('[ReviewService] Failed to process review safely', {
      outletId: outlet.id,
      reviewId,
      error: err.message,
    });
    await reviewRepo.updateReviewStatus(docId, STATUS.FAILED, {
      failureReason: err.message,
      retryCount: 0,
      failedAt: new Date(),
    });
    await reviewRepo.writeLog({
      eventType: 'REVIEW_FAILED',
      status: 'error',
      providerSource: provider.providerType,
      payload: { outletId: outlet.id, reviewId },
      errorMessage: err.message,
      stackTrace: err.stack,
    });
  }
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function resolveOutletForProvider(outlet, provider) {
  if (
    provider &&
    provider.providerType === 'SCRAPER' &&
    !outlet.placeId &&
    outlet.googleLocationId
  ) {
    logger.warn('[ReviewService] SCRAPER placeId missing; using googleLocationId fallback', {
      outletId: outlet.id,
      googleLocationId: outlet.googleLocationId,
    });

    return {
      ...outlet,
      placeId: outlet.googleLocationId,
    };
  }

  return outlet;
}

module.exports = {
  processOutletReviews,
  processSingleReview,
  processReviewsSequentially,
  randomDelay,
  processReviewWithSafety,
};
