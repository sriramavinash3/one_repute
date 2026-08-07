/**
 * verify_pricing.js
 *
 * E2E Integration test for Location-Aware Pricing, Country Detection,
 * and dynamic Razorpay Plan mapping.
 */

'use strict';

require('dotenv').config({ path: 'd:/dev project/onerepute-ag/one_repute/backend/.env' });
const { getDb } = require('d:/dev project/onerepute-ag/one_repute/backend/config/firebase');
const pricingService = require('d:/dev project/onerepute-ag/one_repute/backend/services/pricingService');
const paymentService = require('d:/dev project/onerepute-ag/one_repute/backend/services/paymentService');
const logger = require('d:/dev project/onerepute-ag/one_repute/backend/utils/logger');

async function runTests() {
  logger.info('[Test] Initializing Localization & Pricing E2E Audit...');

  try {
    const db = getDb();

    // 1. Verify Seeding & planPrices collection
    logger.info('[Test] Verifying planPrices collection entries...');
    const pricesSnap = await db.collection('planPrices').get();
    logger.info(`[Test] Total seeded prices found: ${pricesSnap.size}`);
    
    if (pricesSnap.size < 6) {
      throw new Error('Database prices not fully seeded. Ensure seeder runs.');
    }

    // 2. Test Country Detection Hierarchy
    logger.info('[Test] Testing priority country detection rules...');

    // Rule A: IP Geolocation header
    const reqIpUS = { headers: { 'cf-ipcountry': 'US' } };
    const countryIpUS = pricingService.detectCountry(reqIpUS);
    logger.info(`[Test] IP Header 'US' -> Detected Country: ${countryIpUS} (Expected: US)`);
    if (countryIpUS !== 'US') throw new Error('IP Header detection failed');

    // Rule B: Browser Locale header
    const reqLangIN = { headers: { 'accept-language': 'en-IN,en;q=0.9' } };
    const countryLangIN = pricingService.detectCountry(reqLangIN);
    logger.info(`[Test] Accept-Language 'en-IN' -> Detected Country: ${countryLangIN} (Expected: IN)`);
    if (countryLangIN !== 'IN') throw new Error('Browser locale detection failed');

    // Rule C: Timezone fallback
    const reqTz = { body: { timezone: 'Asia/Kolkata' }, headers: {} };
    const countryTz = pricingService.detectCountry(reqTz);
    logger.info(`[Test] Timezone 'Asia/Kolkata' -> Detected Country: ${countryTz} (Expected: IN)`);
    if (countryTz !== 'IN') throw new Error('Timezone fallback failed');

    // Rule D: Customer document override
    const mockCustomerData = { billingCountry: 'US' };
    const countryCust = pricingService.detectCountry(null, mockCustomerData);
    logger.info(`[Test] Customer Billing Country 'US' -> Detected Country: ${countryCust} (Expected: US)`);
    if (countryCust !== 'US') throw new Error('Customer billing country override failed');

    // Rule E: Default fallback
    const countryDefault = pricingService.detectCountry(null);
    logger.info(`[Test] Empty Context Default -> Detected Country: ${countryDefault} (Expected: IN)`);
    if (countryDefault !== 'IN') throw new Error('Default fallback failed');

    // 3. Test Pricing Resolution
    logger.info('[Test] Verifying localized pricing lookup...');

    const priceIN = await pricingService.getPlanPrice('plan_growth', 'IN');
    logger.info(`[Test] Growth Plan IN -> Currency: ${priceIN.currency}, Monthly Price: ${priceIN.monthlyPrice} (Expected: INR / 1999)`);
    if (priceIN.currency !== 'INR' || priceIN.monthlyPrice !== 1999) throw new Error('Growth Plan IN price query incorrect');

    const priceUS = await pricingService.getPlanPrice('plan_growth', 'US');
    logger.info(`[Test] Growth Plan US -> Currency: ${priceUS.currency}, Monthly Price: ${priceUS.monthlyPrice} (Expected: USD / 79)`);
    if (priceUS.currency !== 'USD' || priceUS.monthlyPrice !== 79) throw new Error('Growth Plan US price query incorrect');

    // 4. Test Razorpay Plan Mapping in createSubscription
    logger.info('[Test] Testing dynamic Plan ID selection during subscription creation...');
    
    // Create subscription for Indian customer
    const mockCustIdIN = 'cust_test_in_' + Math.random().toString(36).substring(2, 8);
    const subIN = await paymentService.createSubscription(mockCustIdIN, 'plan_starter', 'monthly', 'IN');
    logger.info(`[Test] Indian Customer Starter -> Active Plan: ${subIN.plan_id} (Expected: plan_starter_in_monthly_dummy)`);
    if (subIN.plan_id !== 'plan_starter_in_monthly_dummy') throw new Error('Razorpay Indian Plan ID mapping incorrect');

    // Create subscription for US customer
    const mockCustIdUS = 'cust_test_us_' + Math.random().toString(36).substring(2, 8);
    const subUS = await paymentService.createSubscription(mockCustIdUS, 'plan_starter', 'monthly', 'US');
    logger.info(`[Test] US Customer Starter -> Active Plan: ${subUS.plan_id} (Expected: plan_starter_us_monthly_dummy)`);
    if (subUS.plan_id !== 'plan_starter_us_monthly_dummy') throw new Error('Razorpay US Plan ID mapping incorrect');

    // 5. Test getBillingInfo response matching currency and region properties
    logger.info('[Test] Verifying getBillingInfo returns localized attributes...');
    const billingInfo = await paymentService.getBillingInfo(mockCustIdUS);
    
    logger.info(`[Test] Billing Info -> Resolved Country: ${billingInfo.subscription.billingCountry} (Expected: US)`);
    logger.info(`[Test] Billing Info -> Resolved Currency: ${billingInfo.subscription.currency} (Expected: USD)`);
    
    const dbGrowth = billingInfo.plans.find(p => p.id === 'plan_growth');
    logger.info(`[Test] Billing Info Growth Plan Price -> ${dbGrowth.currencySymbol}${dbGrowth.monthlyPrice} (Expected: $79)`);
    if (dbGrowth.monthlyPrice !== 79 || dbGrowth.currencySymbol !== '$') {
      throw new Error('getBillingInfo did not return correct localized pricing data');
    }

    // Clean up test documents
    logger.info('[Test] Cleaning up test customer records...');
    await db.collection('customers').doc(mockCustIdIN).delete();
    await db.collection('customers').doc(mockCustIdUS).delete();

    logger.info('[Test] ALL INTEGRATION TESTS PASSED SUCCESSFULLY! ✔');
  } catch (err) {
    logger.error('[Test] INTEGRATION TEST FAILURE', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

runTests();
