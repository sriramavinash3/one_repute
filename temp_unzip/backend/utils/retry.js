/**
 * utils/retry.js
 *
 * Generic retry wrapper with exponential backoff + jitter.
 * Used by all external API callers (Google, OpenAI, WhatsApp).
 *
 * Usage:
 *   const result = await withRetry(() => someApiCall(), { retries: 3, label: 'OpenAI' });
 */

'use strict';

const logger = require('./logger');

/**
 * @param {Function} fn            - Async function to retry
 * @param {Object}  options
 * @param {number}  options.retries      - Max retry attempts (default: 3)
 * @param {number}  options.baseDelayMs  - Initial delay in ms (default: 500)
 * @param {number}  options.maxDelayMs   - Max delay cap in ms (default: 10000)
 * @param {string}  options.label        - Label for log messages
 * @returns {Promise<*>}
 */
async function withRetry(fn, options = {}) {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 10_000,
    label = 'Operation',
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      const isLastAttempt = attempt === retries;

      if (isLastAttempt) {
        logger.warn(`[Retry] ${label} failed after ${retries} attempts`, {
          error: err.message,
        });
        break;
      }

      // Exponential backoff with ±20% jitter to avoid thundering herd
      const exponential = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
      const delay = Math.min(exponential + jitter, maxDelayMs);

      logger.warn(`[Retry] ${label} attempt ${attempt}/${retries} failed — retrying in ${Math.round(delay)}ms`, {
        error: err.message,
      });

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { withRetry, sleep };
