/**
 * utils/reviewHash.js
 *
 * Stable hashing for review deduplication across providers.
 */

'use strict';

const crypto = require('crypto');
const { sanitizeString } = require('./validator');

function computeReviewHash({ placeId, customerName, text, rating, reviewTimestamp }) {
  const safePlaceId = sanitizeString(placeId || '', 200);
  const safeName = sanitizeString(customerName || '', 200);
  const safeText = sanitizeString(text || '', 5000);
  const safeRating = Number(rating || 0);
  const safeTime = sanitizeString(String(reviewTimestamp || ''), 200);

  const payload = `${safePlaceId}|${safeName}|${safeText}|${safeRating}|${safeTime}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

module.exports = { computeReviewHash };
