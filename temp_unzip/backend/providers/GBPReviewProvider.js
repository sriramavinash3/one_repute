/**
 * providers/GBPReviewProvider.js
 *
 * Official Google Business Profile provider.
 * Wrapper around existing googleService to keep compatibility.
 */

'use strict';

const googleService = require('../services/googleService');

class GBPReviewProvider {
  constructor() {
    this.providerType = 'GBP';
    this.supportsReply = true;
  }

  /**
   * Fetch reviews from GBP API and normalize them.
   *
   * @param {Object} outlet
   * @returns {Promise<Array>}
   */
  async fetchReviews(outlet) {
    const rawReviews = await googleService.fetchReviews(outlet);
    return rawReviews.map((raw) => this.normalizeGbpReview(raw, outlet.placeId));
  }

  async searchBusinesses() {
    return [];
  }

  async syncBusiness(outlet) {
    return {
      placeId: outlet.placeId || null,
      providerType: this.providerType,
    };
  }

  async postReply(outlet, review, replyText) {
    const resourceName = review.rawName || review.providerReviewId || review.rawName;
    if (!resourceName) {
      throw new Error('Missing GBP review resource name for reply');
    }
    await googleService.postReply(outlet, resourceName, replyText);
  }

  normalizeGbpReview(raw, placeId) {
    const ratingMap = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
    const numericRating = typeof raw.starRating === 'number' ? raw.starRating : ratingMap[raw.starRating];

    return {
      placeId: placeId || null,
      providerSource: 'GBP',
      providerReviewId: raw.reviewId || raw.name || null,
      customerName: raw.reviewer?.displayName || raw.reviewerName || 'Anonymous',
      rating: numericRating,
      text: raw.comment || raw.text || '',
      reviewTimestamp: raw.updateTime || raw.createTime || null,
      rawName: raw.name,
      raw,
    };
  }
}

module.exports = GBPReviewProvider;
