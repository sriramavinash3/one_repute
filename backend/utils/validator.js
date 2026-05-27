/**
 * utils/validator.js
 *
 * Validates and sanitizes external data before persisting or processing.
 * Prevents bad data from entering the system — never trust external APIs.
 */

'use strict';

/**
 * Sanitize a string: trim, remove control characters.
 * @param {*} value
 * @param {number} maxLen
 * @returns {string}
 */
function sanitizeString(value, maxLen = 5000) {
  if (typeof value !== 'string') return '';
  // Remove null bytes and control characters (except newlines/tabs)
  return value
    .replace(/\0/g, '')
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Validate a review object from Google Business Profile API.
 * Returns { valid: boolean, errors: string[], review: sanitizedReview }
 *
 * @param {Object} rawReview
 * @returns {{ valid: boolean, errors: string[], review: Object|null }}
 */
function validateReview(rawReview) {
  const errors = [];

  if (!rawReview || typeof rawReview !== 'object') {
    return { valid: false, errors: ['Review must be an object'], review: null };
  }

  const reviewId = sanitizeString(rawReview.reviewId || rawReview.name || '');
  if (!reviewId) errors.push('Missing reviewId');

  const rating = rawReview.starRating;
  const ratingMap = {
    ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5,
  };
  const numericRating = typeof rating === 'number' ? rating : ratingMap[rating];
  if (!numericRating || numericRating < 1 || numericRating > 5) {
    errors.push(`Invalid rating: ${rating}`);
  }

  const customerName = sanitizeString(
    rawReview.reviewer?.displayName || rawReview.reviewerName || 'Anonymous',
    200
  );

  const text = sanitizeString(
    rawReview.comment || rawReview.text || '',
    5000
  );

  const createdAt = rawReview.createTime || rawReview.updateTime || new Date().toISOString();

  if (errors.length > 0) {
    return { valid: false, errors, review: null };
  }

  return {
    valid: true,
    errors: [],
    review: {
      reviewId,
      rating: numericRating,
      customerName,
      text,
      createdAt,
      rawName: rawReview.name, // Google's resource name (for posting replies)
    },
  };
}

/**
 * Validate a normalized review object from providers.
 *
 * @param {Object} review
 * @returns {{ valid: boolean, errors: string[], review: Object|null }}
 */
function validateNormalizedReview(review) {
  const errors = [];

  if (!review || typeof review !== 'object') {
    return { valid: false, errors: ['Review must be an object'], review: null };
  }

  const placeId = sanitizeString(review.placeId || '', 200);
  if (!placeId) errors.push('Missing placeId');

  const rating = Number(review.rating || 0);
  if (!rating || rating < 1 || rating > 5) errors.push(`Invalid rating: ${review.rating}`);

  const customerName = sanitizeString(review.customerName || 'Anonymous', 200);
  const text = sanitizeString(review.text || '', 5000);
  const providerReviewId = sanitizeString(review.providerReviewId || '', 200);
  const reviewTimestamp = review.reviewTimestamp || null;
  const reviewerPhotoURL = sanitizeString(review.reviewerPhotoURL || '', 2000) || null;
  const reviewUrl = sanitizeString(review.reviewUrl || '', 2000) || null;

  if (errors.length > 0) {
    return { valid: false, errors, review: null };
  }

  return {
    valid: true,
    errors: [],
    review: {
      placeId,
      providerSource: review.providerSource || null,
      providerReviewId,
      customerName,
      reviewerPhotoURL,
      reviewUrl,
      rating,
      text,
      reviewTimestamp,
      rawName: review.rawName || null,
      raw: review.raw || null,
    },
  };
}

/**
 * Validate an outlet document from Firestore.
 *
 * @param {Object} data
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateOutlet(data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Outlet data must be an object'] };
  }

  if (!sanitizeString(data.name)) errors.push('Missing outlet name');
  if (!sanitizeString(data.googleAccountId || '')) errors.push('Missing googleAccountId');
  if (!sanitizeString(data.googleLocationId || '')) errors.push('Missing googleLocationId');
  if (!sanitizeString(data.googleRefreshToken || '')) errors.push('Missing googleRefreshToken');

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a phone number is in E.164 format (+1234567890)
 * @param {string} number
 * @returns {boolean}
 */
function isValidPhone(number) {
  return /^\+[1-9]\d{7,14}$/.test(String(number).trim());
}

module.exports = {
  sanitizeString,
  validateReview,
  validateNormalizedReview,
  validateOutlet,
  isValidPhone,
};
