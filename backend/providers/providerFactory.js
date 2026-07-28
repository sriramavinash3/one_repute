/**
 * providers/providerFactory.js
 *
 * Returns the correct review provider based on outlet.providerType.
 */

'use strict';

const GBPReviewProvider = require('./GBPReviewProvider');

function getReviewProvider(outlet) {
  // Always use GBP for the integrated setup
  return new GBPReviewProvider();
}

module.exports = { getReviewProvider };
