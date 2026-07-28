/**
 * services/googleService.js
 *
 * Handles all interactions with the Google Business Profile API:
 *  - OAuth2 token management (auto-refresh)
 *  - Fetching reviews (with pagination)
 *  - Posting replies to reviews
 */

'use strict';

const { google } = require('googleapis');
const env = require('../config/env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const outletRepo = require('../repositories/outletRepo');

// ─── OAuth2 Client Factory ────────────────────────────────────────────────────

/**
 * Create an OAuth2 client pre-loaded with an outlet's refresh token.
 * The client auto-refreshes the access token when it expires.
 *
 * @param {Object} outlet - Outlet document from Firestore
 * @returns {google.auth.OAuth2}
 */
function createOAuthClient(outlet) {
  const oauth2Client = new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );

  oauth2Client.setCredentials({
    refresh_token: outlet.googleRefreshToken,
  });

  // Persist rotated tokens back to Firestore
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      logger.info('[GoogleService] Refresh token rotated — updating Firestore', {
        outletId: outlet.id,
      });
      await outletRepo.updateRefreshToken(outlet.id, tokens.refresh_token);
    }
  });

  return oauth2Client;
}

// ─── Fetch Reviews ────────────────────────────────────────────────────────────

/**
 * Fetch all reviews for a given outlet, handling pagination.
 * Returns raw review objects from the API.
 *
 * Google Business Profile API:
 * GET https://mybusiness.googleapis.com/v4/accounts/{account}/locations/{location}/reviews
 *
 * @param {Object} outlet
 * @returns {Promise<Array>} - Array of raw review objects
 */
async function fetchReviews(outlet) {
  const auth = createOAuthClient(outlet);

  const allReviews = [];
  let nextPageToken = undefined;
  const locationName = `accounts/${outlet.googleAccountId}/locations/${outlet.googleLocationId}`;

  do {
    const response = await handleQuotaErrors(
      async () => {
        const res = await auth.request({
          url: `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
          method: 'GET',
          params: {
            pageSize: 50,
            pageToken: nextPageToken,
            orderBy: 'updateTime desc',
          },
        });
        return res.data;
      },
      3,
      5000
    );

    const reviews = response.reviews || [];
    allReviews.push(...reviews);
    nextPageToken = response.nextPageToken;

    logger.debug('[GoogleService] Fetched review page', {
      outletId: outlet.id,
      count: reviews.length,
      hasMore: !!nextPageToken,
    });

    // Safety: stop after 10 pages (~500 reviews) per run to avoid runaway loops
    if (allReviews.length >= 500) {
      logger.warn('[GoogleService] Hit max review fetch limit (500)', { outletId: outlet.id });
      break;
    }
  } while (nextPageToken);

  logger.info('[GoogleService] Fetched reviews for outlet', {
    outletId: outlet.id,
    total: allReviews.length,
  });

  return allReviews;
}

// ─── Post Reply ───────────────────────────────────────────────────────────────

/**
 * Post an AI-generated reply to a specific review on Google.
 *
 * @param {Object} outlet
 * @param {string} reviewResourceName - Google's review resource name (e.g. locations/123/reviews/abc)
 * @param {string} replyText
 * @returns {Promise<void>}
 */
async function postReply(outlet, reviewResourceName, replyText) {
  const auth = createOAuthClient(outlet);

  await handleQuotaErrors(
    async () => {
      await auth.request({
        url: `https://mybusiness.googleapis.com/v4/${reviewResourceName}/reply`,
        method: 'PUT',
        data: {
          comment: replyText,
        },
      });
    },
    3,
    5000
  );

  logger.info('[GoogleService] Reply posted successfully', {
    outletId: outlet.id,
    reviewName: reviewResourceName,
  });
}

let quotaExceeded = false;

// Utility function to handle rate limiting and quota errors
async function handleQuotaErrors(apiCall, retries = 3, backoff = 5000) {
  if (quotaExceeded) {
    throw new Error('API processing suspended due to previous quota limit hit. Please wait for cooldown.');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await apiCall();
    } catch (err) {
      const isQuotaError =
        err?.code === 429 ||
        err?.response?.status === 429 ||
        /quota\s+exceeded/i.test(err?.message || '');

      if (isQuotaError) {
        quotaExceeded = true; // Stop all further calls during this run
        
        // Mark a cooldown (e.g. 15 minutes) before allowing retries again
        setTimeout(() => { quotaExceeded = false; }, 15 * 60 * 1000);

        logger.error('[GoogleService] Critical: Quota exceeded. Suspending all API calls.', {
          error: err.message,
        });
        
        throw err; // Re-throw to caller to handle abortion
      } else {
        throw err; // Non-quota errors handled by standard retry logic elsewhere if needed
      }
    }
  }

  throw new Error('Max retries reached for API call');
}

module.exports = {
  fetchReviews,
  postReply,
  handleQuotaErrors,
  resetQuotaFlag: () => { quotaExceeded = false; }
};
