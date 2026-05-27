'use strict';

const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

/**
 * General API rate limiter — protects health/status endpoints.
 * 100 requests per minute per IP.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('[rateLimiter] Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
});

module.exports = { apiLimiter };
