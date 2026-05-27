/**
 * providers/ApifyReviewProvider.js
 *
 * Temporary review provider powered by Apify Google Maps Reviews Scraper.
 * Returns normalized reviews compatible with existing GMB data model.
 */

'use strict';

const axios = require('axios');
const env = require('../config/env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { sanitizeString } = require('../utils/validator');

const APIFY_BASE = 'https://api.apify.com/v2';

class ApifyReviewProvider {
  constructor() {
    this.providerType = 'SCRAPER';
    this.supportsReply = false;
  }

  /**
   * Fetch recent reviews using Apify. Returns normalized reviews.
   *
   * @param {Object} outlet
   * @param {Object} options
   * @param {number} options.maxReviews
   * @returns {Promise<Array>}
   */
  async fetchReviews(outlet, options = {}) {
    const placeId = outlet.placeId;

    if (!placeId) {
      throw new Error('Missing placeId for outlet');
    }

    const maxReviews = options.maxReviews || env.scraper.maxReviews;
    const apifyTimeoutMs = Math.max(env.scraper.apifyTimeoutMs || 0, 120000);
    const runInput = {
      startUrls: [
        {
          url: `https://www.google.com/maps/place/?q=place_id:${placeId}`,
        },
      ],
      placeIds: [placeId],
      maxReviews,
      reviewsSort: 'newest',
      reviewsStartDate: options.reviewsStartDate || undefined,
      language: 'en',
      reviewsOrigin: 'all',
      personalData: true,
    };

    if (!runInput.reviewsStartDate) {
      delete runInput.reviewsStartDate;
    }

    const run = await this.runApify(runInput, apifyTimeoutMs);
    const items = await this.getDatasetItems(run.defaultDatasetId, maxReviews, apifyTimeoutMs);

    const uniqueItems = [];
    const seenReviewIds = new Set();

    for (const item of items) {
      const reviewId = sanitizeString(
        item.reviewUrl || item.reviewId || item.reviewIdHash || item.id || '',
        500
      );

      if (!reviewId || seenReviewIds.has(reviewId)) {
        continue;
      }

      seenReviewIds.add(reviewId);
      uniqueItems.push(item);
    }

    logger.info('[ApifyProvider] Reviews fetched', {
      outletId: outlet.id,
      placeId,
      count: uniqueItems.length,
    });

    return uniqueItems.map((item) => this.normalizeApifyReview(item, placeId));
  }

  /**
   * Search businesses using Google Places Text Search API.
   *
   * @param {string} query
   * @returns {Promise<Array>}
   */
  async searchBusinesses(query) {
    if (!env.googlePlaces.apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is not configured');
    }

    const url = 'https://maps.googleapis.com/maps/api/place/textsearch/json';

    return withRetry(
      async () => {
        const response = await axios.get(url, {
          params: {
            query,
            key: env.googlePlaces.apiKey,
          },
          timeout: env.scraper.apifyTimeoutMs,
        });

        const results = response.data?.results || [];
        return results.map((item) => ({
          placeId: item.place_id,
          name: item.name,
          address: item.formatted_address,
        }));
      },
      { retries: 2, baseDelayMs: 1000, label: 'Places.searchBusinesses' }
    );
  }

  /**
   * Sync business metadata for scraper mode.
   *
   * @param {Object} outlet
   * @returns {Promise<Object>}
   */
  async syncBusiness(outlet) {
    return {
      placeId: outlet.placeId || null,
      providerType: this.providerType,
    };
  }

  /**
   * Apify does not support posting replies.
   */
  async postReply() {
    throw new Error('Apify provider does not support posting replies');
  }

  // ─── Apify API Helpers ───────────────────────────────────────────────────

  async runApify(input, timeoutMs) {
    const token = env.apify.token;

    if (!token) {
      throw new Error('APIFY_TOKEN is not configured');
    }

    const runUrl = this.buildRunUrl();

    return withRetry(
      async () => {
        const response = await axios.post(runUrl, input, {
          headers: { 'Content-Type': 'application/json' },
          timeout: timeoutMs || env.scraper.apifyTimeoutMs,
        });
        const run = response.data?.data;

        if (run && run.status && run.status !== 'SUCCEEDED') {
          throw new Error(`Apify run did not succeed: ${run.status}`);
        }

        return run;
      },
      { retries: 3, baseDelayMs: 1000, label: 'Apify.run' }
    );
  }

  buildRunUrl() {
    const token = env.apify.token;
    const waitForFinish = env.apify.waitForFinishSeconds || 120;
    if (env.apify.taskId) {
      return `${APIFY_BASE}/actor-tasks/${env.apify.taskId}/runs?token=${token}&waitForFinish=${waitForFinish}`;
    }
    if (env.apify.actorId) {
      return `${APIFY_BASE}/acts/${env.apify.actorId}/runs?token=${token}&waitForFinish=${waitForFinish}`;
    }
    throw new Error('APIFY_TASK_ID or APIFY_ACTOR_ID must be configured');
  }

  async getDatasetItems(datasetId, limit, timeoutMs) {
    const token = env.apify.token;

    const url = `${APIFY_BASE}/datasets/${datasetId}/items?clean=true&limit=${limit}&token=${token}`;

    return withRetry(
      async () => {
        const response = await axios.get(url, { timeout: timeoutMs || env.scraper.apifyTimeoutMs });
        return Array.isArray(response.data) ? response.data : [];
      },
      { retries: 3, baseDelayMs: 1000, label: 'Apify.dataset.items' }
    );
  }

  // ─── Normalization ───────────────────────────────────────────────────────

  normalizeApifyReview(item, placeId) {
    const providerReviewId = sanitizeString(
      item.reviewUrl || item.reviewId || item.reviewIdHash || item.id || '',
      500
    );

    const rating = Number(item.reviewStars || item.rating || item.stars || 0);

    const reviewText = sanitizeString(
      item.reviewText || item.text || item.reviewTextOriginal || '',
      5000
    );

    const customerName = sanitizeString(
      item.reviewerName || item.userName || item.reviewer || item.name || 'Anonymous',
      200
    );

    const reviewerPhotoURL = sanitizeString(
      item.reviewerPhotoURL || item.reviewerPhotoUrl || item.photoUrl || item.photo || '',
      2000
    );

    const reviewTimestamp = item.reviewTimestamp || item.reviewDate || item.date || null;

    return {
      placeId,
      providerSource: 'SCRAPER',
      providerReviewId,
      customerName,
      reviewerPhotoURL: reviewerPhotoURL || null,
      rating,
      text: reviewText,
      reviewTimestamp,
      reviewUrl: item.reviewUrl || null,
      raw: item,
    };
  }
}

module.exports = ApifyReviewProvider;
