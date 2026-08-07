/**
 * services/pricingService.js
 *
 * Central Pricing Engine: Handles country detection, localized plan price mappings,
 * and dynamically resolves regional details from Firestore.
 */

'use strict';

const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');

// Local in-memory cache for plan prices
let pricesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes cache TTL

/**
 * Detect user country using the prioritised hierarchy:
 * 1. Billing Country (from customerData)
 * 2. Account Country (from userData)
 * 3. Organization/Outlet Country (from outletData)
 * 4. IP Geolocation headers
 * 5. Browser Locale
 * 6. Timezone (fallback)
 */
function detectCountry(req, customerData = null, userData = null, outletData = null) {
  // 1. Billing Country
  if (customerData && customerData.billingCountry) {
    logger.info('[PricingService] Resolved country from billing records:', customerData.billingCountry);
    return normalizeCountryCode(customerData.billingCountry);
  }

  // 2. Account Country
  if (userData && userData.country) {
    logger.info('[PricingService] Resolved country from account profile:', userData.country);
    return normalizeCountryCode(userData.country);
  }

  // 3. Organization/Outlet Country
  if (outletData && outletData.country) {
    logger.info('[PricingService] Resolved country from outlet settings:', outletData.country);
    return normalizeCountryCode(outletData.country);
  }

  if (req) {
    // 4. IP Geolocation headers
    const ipCountry = req.headers['cf-ipcountry'] || req.headers['x-country-code'] || req.headers['x-ip-country'];
    if (ipCountry && typeof ipCountry === 'string' && ipCountry.trim().length === 2) {
      const code = ipCountry.trim().toUpperCase();
      logger.info('[PricingService] Resolved country from IP headers:', code);
      return code;
    }

    // 5. Browser Locale (Accept-Language header)
    const acceptLang = req.headers['accept-language'] || '';
    if (acceptLang) {
      // E.g. "en-US,en;q=0.9" -> matches "US", or "en-IN" -> matches "IN"
      const match = acceptLang.match(/([a-zA-Z]{2})-([a-zA-Z]{2})/);
      if (match && match[2]) {
        const code = match[2].toUpperCase();
        logger.info('[PricingService] Resolved country from Accept-Language header:', code);
        return code;
      }
    }

    // 6. Timezone Check (e.g. from request headers or body)
    const clientTimezone = req.body?.timezone || req.query?.timezone || req.headers['x-timezone'] || '';
    if (clientTimezone && typeof clientTimezone === 'string') {
      const tz = clientTimezone.toLowerCase();
      if (tz.includes('kolkata') || tz.includes('calcutta') || tz.includes('delhi') || tz.includes('mumbai') || tz.includes('india') || tz.includes('ist')) {
        logger.info('[PricingService] Resolved country from timezone fallback: IN');
        return 'IN';
      }
    }
  }

  // Final fallback is IN (primary market)
  return 'IN';
}

/**
 * Normalizes country strings/codes to 2-letter codes.
 */
function normalizeCountryCode(code) {
  if (!code || typeof code !== 'string') return 'IN';
  const val = code.trim().toUpperCase();
  if (val === 'INDIA') return 'IN';
  if (val === 'UNITED STATES' || val === 'USA') return 'US';
  if (val.length === 2) return val;
  return 'IN';
}

/**
 * Invalidates the plan prices cache.
 */
function invalidateCache() {
  pricesCache = null;
  cacheTimestamp = 0;
  logger.info('[PricingService] Invalidated plan prices cache');
}

/**
 * Preload all plan prices into local cache memory.
 */
async function getPricesCached() {
  const now = Date.now();
  if (pricesCache && (now - cacheTimestamp < CACHE_TTL)) {
    return pricesCache;
  }

  try {
    const db = getDb();
    const pricesSnap = await db.collection('planPrices').get();
    
    const pricesMap = {};
    pricesSnap.docs.forEach(doc => {
      const data = doc.data();
      pricesMap[doc.id] = data;
    });

    pricesCache = pricesMap;
    cacheTimestamp = now;
    return pricesCache;
  } catch (err) {
    logger.error('[PricingService] Failed to load plan prices from Firestore', { error: err.message });
    return pricesCache || {}; // return stale cache if database offline
  }
}

/**
 * Resolves pricing parameters for a given plan and country code.
 */
async function getPlanPrice(planId, countryCode = 'IN') {
  const pricesMap = await getPricesCached();
  const docId = `${planId}_${countryCode.toUpperCase()}`;
  
  if (pricesMap[docId]) {
    return pricesMap[docId];
  }

  // Fallback lookup: if country does not have configured prices, fall back to US (global) or IN (default)
  const fallbackId = countryCode.toUpperCase() === 'IN' ? `${planId}_IN` : `${planId}_US`;
  if (pricesMap[fallbackId]) {
    return pricesMap[fallbackId];
  }

  // absolute fallback to IN Starter pricing parameters
  return {
    planId,
    country: 'IN',
    currency: 'INR',
    monthlyPrice: 999,
    annualPrice: 9999,
    razorpayMonthlyPlanId: 'plan_starter_in_monthly_dummy',
    razorpayAnnualPlanId: 'plan_starter_in_annual_dummy',
    status: 'active'
  };
}

/**
 * Returns localized currency symbols.
 */
function getCurrencySymbol(currency) {
  if (currency === 'INR') return '₹';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  if (currency === 'GBP') return '£';
  return currency || '₹';
}

module.exports = {
  detectCountry,
  getPlanPrice,
  getCurrencySymbol,
  invalidateCache,
};
