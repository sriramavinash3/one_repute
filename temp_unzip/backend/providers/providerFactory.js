/**
 * providers/providerFactory.js
 *
 * Returns the correct review provider based on outlet.providerType.
 */

'use strict';

const ApifyReviewProvider = require('./ApifyReviewProvider');
const GBPReviewProvider = require('./GBPReviewProvider');

function getReviewProvider(outlet) {
  if (outlet && String(outlet.providerType).toUpperCase() === 'GBP') {
    return new GBPReviewProvider();
  }
  return new ApifyReviewProvider();
}

module.exports = { getReviewProvider };
