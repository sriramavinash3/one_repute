/**
 * services/permissionService.js
 *
 * Central Feature Permission Engine.
 * Handles feature checks, limit retrieval, and usage tracking with in-memory caching.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');

const PLANS_COLLECTION = 'plans';
const FEATURES_COLLECTION = 'planFeatures';
const USAGE_COLLECTION = 'customerUsage';
const CUSTOMERS_COLLECTION = 'customers';

// In-memory cache for plan features to optimize speed and avoid repeated database reads
const _cache = new Map();
const CACHE_TTL_MS = 60000; // 1 minute Cache TTL

/**
 * Clear the permissions cache for a specific plan or globally.
 * Call this when a plan changes.
 */
function invalidateCache() {
  _cache.clear();
  logger.info('[PermissionService] Cleared permissions cache');
}

/**
 * Load all plan features from Firestore.
 * Caches results.
 *
 * @param {string} planId
 * @returns {Promise<Object>} plan features key-value map
 */
async function getPlanFeatures(planId) {
  const cacheKey = `plan_${planId}`;
  const cached = _cache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.features;
  }

  const db = getDb();
  const snap = await db.collection(FEATURES_COLLECTION)
    .where('planId', '==', planId)
    .get();

  const features = {};
  snap.docs.forEach((doc) => {
    const data = doc.data();
    features[data.featureKey] = data.featureValue;
  });

  _cache.set(cacheKey, { features, timestamp: now });
  return features;
}

/**
 * Fetch customer's active plan ID.
 * Defaults to 'plan_starter' if not found or inactive.
 *
 * @param {string} customerId
 * @returns {Promise<string>} planId
 */
async function getCustomerPlanId(customerId) {
  const db = getDb();
  const doc = await db.collection(CUSTOMERS_COLLECTION).doc(customerId).get();
  if (!doc.exists) return 'plan_starter';
  
  const data = doc.data();
  // If subscription status is unpaid or inactive, default to starter plan limits
  const status = data.subscriptionStatus || 'inactive';
  if (['unpaid', 'inactive', 'past_due'].includes(status.toLowerCase())) {
    // Wait! Let past_due have a grace period, but for safety, starter is fallback
    return 'plan_starter';
  }
  return data.plan || 'plan_starter';
}

/**
 * Check if a feature is enabled for a customer.
 *
 * @param {string} customerId
 * @param {string} featureKey
 * @returns {Promise<boolean>}
 */
async function hasFeature(customerId, featureKey) {
  const planId = await getCustomerPlanId(customerId);
  const features = await getPlanFeatures(planId);
  
  const val = features[featureKey];
  if (typeof val === 'boolean') {
    return val;
  }
  return val !== undefined && val !== null;
}

/**
 * Retrieve the configured limit for a feature on the customer's plan.
 *
 * @param {string} customerId
 * @param {string} featureKey
 * @returns {Promise<any>} feature value (e.g. limit number or config string)
 */
async function getLimit(customerId, featureKey) {
  const planId = await getCustomerPlanId(customerId);
  const features = await getPlanFeatures(planId);
  return features[featureKey] !== undefined ? features[featureKey] : null;
}

/**
 * Retrieve active usage stats for a customer.
 *
 * @param {string} customerId
 * @returns {Promise<Object>} usage document fields
 */
async function getCustomerUsage(customerId) {
  const db = getDb();
  const doc = await db.collection(USAGE_COLLECTION).doc(customerId).get();
  if (!doc.exists) {
    return {
      review_reply_count: 0,
      smart_qr_count: 0,
      competitor_count: 0,
      team_member_count: 0,
      currentMonth: new Date().toISOString().slice(0, 7),
    };
  }
  return doc.data();
}

/**
 * Calculate remaining limit for a numeric feature.
 *
 * @param {string} customerId
 * @param {string} featureKey
 * @returns {Promise<number>} remaining quota (returns 0 if not allowed or exceeded)
 */
async function remainingLimit(customerId, featureKey) {
  const limit = await getLimit(customerId, featureKey);
  if (typeof limit !== 'number') {
    const isEnabled = await hasFeature(customerId, featureKey);
    return isEnabled ? Infinity : 0;
  }

  const usage = await getCustomerUsage(customerId);
  let used = 0;

  if (featureKey === 'monthly_review_responses') {
    used = usage.review_reply_count || 0;
  } else if (featureKey === 'competitor_tracking') {
    used = usage.competitor_count || 0;
  } else if (featureKey === 'multi_user_access') {
    used = usage.team_member_count || 0;
  } else if (featureKey === 'smart_qr') {
    used = usage.smart_qr_count || 0;
  }

  return Math.max(0, limit - used);
}

/**
 * Increment a customer's usage counter for a specific feature.
 *
 * @param {string} customerId
 * @param {string} featureKey
 * @param {number} amount
 */
async function incrementUsage(customerId, featureKey, amount = 1) {
  const db = getDb();
  let usageField = '';

  if (featureKey === 'monthly_review_responses') {
    usageField = 'review_reply_count';
  } else if (featureKey === 'competitor_tracking') {
    usageField = 'competitor_count';
  } else if (featureKey === 'multi_user_access') {
    usageField = 'team_member_count';
  } else if (featureKey === 'smart_qr') {
    usageField = 'smart_qr_count';
  }

  if (!usageField) return;

  const ref = db.collection(USAGE_COLLECTION).doc(customerId);
  const snap = await ref.get();
  
  if (!snap.exists) {
    // Check next renewal reset date
    const customerDoc = await db.collection('customers').doc(customerId).get();
    const renewalDate = customerDoc.exists ? customerDoc.data().renewalDate : null;
    
    await ref.set({
      customerId,
      review_reply_count: 0,
      smart_qr_count: 0,
      competitor_count: 0,
      team_member_count: 0,
      currentMonth: new Date().toISOString().slice(0, 7),
      resetDate: renewalDate || admin.firestore.Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000),
      [usageField]: amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    await ref.update({
      [usageField]: admin.firestore.FieldValue.increment(amount),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }

  logger.info(`[PermissionService] Incremented ${usageField} by ${amount} for customer ${customerId}`);
}

/**
 * Check if the customer has permissions for a specific action/feature.
 *
 * @param {string} customerId
 * @param {string} featureKey
 * @param {number} quantity
 * @returns {Promise<Object>} { allowed: boolean, code: string, message: string }
 */
async function checkPermission(customerId, featureKey, quantity = 1) {
  // 1. Check if feature exists/enabled on plan
  const enabled = await hasFeature(customerId, featureKey);
  if (!enabled) {
    const limit = await getLimit(customerId, featureKey);
    const requiredPlan = limit === 0 ? 'Growth Plan' : 'Growth Plan';
    
    // Customize messaging
    let msg = `This feature is available in the Growth Plan.`;
    if (featureKey === 'reply_approval_mode' || featureKey === 'monthly_strategy_call') {
      msg = `This feature is available in the Premium Plan.`;
    }

    return {
      allowed: false,
      code: 'PLAN_UPGRADE_REQUIRED',
      message: msg,
    };
  }

  // 2. Check limits and quotas
  const limitValue = await getLimit(customerId, featureKey);
  if (typeof limitValue === 'number') {
    const remaining = await remainingLimit(customerId, featureKey);
    if (remaining < quantity) {
      return {
        allowed: false,
        code: 'LIMIT_EXCEEDED',
        message: `You have reached your limit of ${limitValue} for this feature. Please upgrade your plan.`,
      };
    }
  }

  return { allowed: true };
}

module.exports = {
  invalidateCache,
  hasFeature,
  getLimit,
  remainingLimit,
  incrementUsage,
  checkPermission,
  getCustomerPlanId,
};
