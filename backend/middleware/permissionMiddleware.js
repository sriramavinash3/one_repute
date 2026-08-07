/**
 * middleware/permissionMiddleware.js
 *
 * Express middlewares for checking subscription plans, features, and quotas.
 */

'use strict';

const permissionService = require('../services/permissionService');
const logger = require('../utils/logger');

/**
 * Enforce that a specific feature is enabled on the customer's plan.
 *
 * @param {string} featureKey
 */
function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_CUSTOMER_CONTEXT',
          message: 'Access denied: Customer context required.'
        });
      }

      const check = await permissionService.checkPermission(customerId, featureKey);
      if (!check.allowed) {
        logger.warn('[PermissionMiddleware] Blocked access to feature', {
          customerId,
          featureKey,
          code: check.code
        });
        return res.status(403).json({
          success: false,
          code: check.code,
          message: check.message
        });
      }

      next();
    } catch (err) {
      logger.error('[PermissionMiddleware] Error in requireFeature middleware', {
        error: err.message,
        featureKey
      });
      res.status(500).json({ error: 'Internal permission check failure' });
    }
  };
}

/**
 * Enforce that the customer has remaining quota for a limit-bound feature.
 *
 * @param {string} featureKey
 * @param {number} quantity
 */
function requireQuota(featureKey, quantity = 1) {
  return async (req, res, next) => {
    try {
      const customerId = req.user?.customerId;
      if (!customerId) {
        return res.status(403).json({
          success: false,
          code: 'UNAUTHORIZED_CUSTOMER_CONTEXT',
          message: 'Access denied: Customer context required.'
        });
      }

      const check = await permissionService.checkPermission(customerId, featureKey, quantity);
      if (!check.allowed) {
        logger.warn('[PermissionMiddleware] Blocked access to quota limit', {
          customerId,
          featureKey,
          code: check.code,
          quantity
        });
        return res.status(403).json({
          success: false,
          code: check.code,
          message: check.message
        });
      }

      next();
    } catch (err) {
      logger.error('[PermissionMiddleware] Error in requireQuota middleware', {
        error: err.message,
        featureKey,
        quantity
      });
      res.status(500).json({ error: 'Internal quota check failure' });
    }
  };
}

module.exports = {
  requireFeature,
  requireQuota,
};
