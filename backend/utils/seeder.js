/**
 * utils/seeder.js
 *
 * Automatically checks and seeds the database with the default plans and plan features
 * if they are not already populated. Run at application startup.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('./logger');
const Razorpay = require('razorpay');

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID || 'dummy_key_id';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'dummy_key_secret';
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
}

function isSeederDummyMode() {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  return !keyId || keyId === 'dummy_key_id' || keyId.startsWith('rzp_test_dummy');
}

const PLANS_COLLECTION = 'plans';
const FEATURES_COLLECTION = 'planFeatures';
const PRICES_COLLECTION = 'planPrices';

const DEFAULT_PLANS = [
  {
    id: 'plan_starter',
    name: 'Starter',
    status: 'active',
    sortOrder: 0,
  },
  {
    id: 'plan_growth',
    name: 'Growth',
    status: 'active',
    sortOrder: 1,
  },
  {
    id: 'plan_premium',
    name: 'Premium',
    status: 'active',
    sortOrder: 2,
  }
];

const DEFAULT_PRICES = [
  // India (IN) - INR (₹)
  {
    planId: 'plan_starter',
    country: 'IN',
    currency: 'INR',
    monthlyPrice: 999,
    annualPrice: 9999,
    razorpayMonthlyPlanId: 'plan_TMzSnSpZurSsaj',
    razorpayAnnualPlanId: 'plan_TMzSnh2gFL378S',
    status: 'active'
  },
  {
    planId: 'plan_growth',
    country: 'IN',
    currency: 'INR',
    monthlyPrice: 1999,
    annualPrice: 19999,
    razorpayMonthlyPlanId: 'plan_TMzQWSOmpu6KQ2',
    razorpayAnnualPlanId: 'plan_TMzQWgEBn2IkjK',
    status: 'active'
  },
  {
    planId: 'plan_premium',
    country: 'IN',
    currency: 'INR',
    monthlyPrice: 2999,
    annualPrice: 29999,
    razorpayMonthlyPlanId: 'plan_TMzQX3f4v5KbJ5',
    razorpayAnnualPlanId: 'plan_TMzQXH2sIjN7mJ',
    status: 'active'
  },
  // United States (US) - USD ($)
  {
    planId: 'plan_starter',
    country: 'US',
    currency: 'USD',
    monthlyPrice: 29,
    annualPrice: 290,
    razorpayMonthlyPlanId: 'plan_TMzQXc5SECtlgu',
    razorpayAnnualPlanId: 'plan_TMzQXsMZxYBSOo',
    status: 'active'
  },
  {
    planId: 'plan_growth',
    country: 'US',
    currency: 'USD',
    monthlyPrice: 79,
    annualPrice: 790,
    razorpayMonthlyPlanId: 'plan_TMzQYA7VdrEFPH',
    razorpayAnnualPlanId: 'plan_TMzQYPeGjHb81b',
    status: 'active'
  },
  {
    planId: 'plan_premium',
    country: 'US',
    currency: 'USD',
    monthlyPrice: 199,
    annualPrice: 1990,
    razorpayMonthlyPlanId: 'plan_TMzQYldq2RaDL7',
    razorpayAnnualPlanId: 'plan_TMzQZ3EOMHiOXr',
    status: 'active'
  }
];

const DEFAULT_FEATURES = {
  plan_starter: {
    monthly_review_responses: 100,
    google_auto_reply: true,
    ai_low_rating_reply: true,
    positive_review_reply: true,
    whatsapp_escalation_levels: 1,
    smart_qr: false,
    sentiment_analysis: 'basic',
    review_dashboard: 'basic',
    monthly_report: 'comprehensive_summary',
    keyword_tracking: false,
    competitor_tracking: 0,
    multi_user_access: 2,
    reply_approval_mode: false,
    escalation_matrix_levels: 1,
    review_trend_insights: false,
    low_rating_pattern_detection: false,
    customer_issue_categories: false,
    monthly_strategy_call: false,
    support_priority: 'standard'
  },
  plan_growth: {
    monthly_review_responses: 250,
    google_auto_reply: true,
    ai_low_rating_reply: true,
    positive_review_reply: true,
    whatsapp_escalation_levels: 2,
    smart_qr: true,
    sentiment_analysis: 'standard',
    review_dashboard: 'full',
    monthly_report: 'detailed_sentiment',
    keyword_tracking: true,
    competitor_tracking: 2,
    multi_user_access: 3,
    reply_approval_mode: false,
    escalation_matrix_levels: 2,
    review_trend_insights: true,
    low_rating_pattern_detection: 'basic',
    customer_issue_categories: true,
    monthly_strategy_call: false,
    support_priority: 'priority'
  },
  plan_premium: {
    monthly_review_responses: 500,
    google_auto_reply: true,
    ai_low_rating_reply: true,
    positive_review_reply: true,
    whatsapp_escalation_levels: 3,
    smart_qr: true,
    sentiment_analysis: 'advanced',
    review_dashboard: 'advanced',
    monthly_report: 'strategy_ai_action',
    keyword_tracking: true,
    competitor_tracking: 5,
    multi_user_access: 5,
    reply_approval_mode: true,
    escalation_matrix_levels: 3,
    review_trend_insights: true,
    low_rating_pattern_detection: 'advanced',
    customer_issue_categories: true,
    monthly_strategy_call: true,
    support_priority: 'premium'
  }
};

/**
 * Seed the plans and their associated features into Firestore.
 */
async function seedDatabase() {
  const db = getDb();
  logger.info('[Seeder] Starting database checks & seeding...');

  try {
    // 1. Seed Plans
    logger.info('[Seeder] Seeding default plans...');
    for (const plan of DEFAULT_PLANS) {
      await db.collection(PLANS_COLLECTION).doc(plan.id).set({
        ...plan,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.info(`[Seeder] Seeded/Merged plan: ${plan.name}`);
    }

    // 2. Seed Features
    logger.info('[Seeder] Seeding plan features...');
    for (const [planId, features] of Object.entries(DEFAULT_FEATURES)) {
      for (const [key, value] of Object.entries(features)) {
        const docId = `${planId}_${key}`;
        await db.collection(FEATURES_COLLECTION).doc(docId).set({
          planId,
          featureKey: key,
          featureValue: value,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      logger.info(`[Seeder] Seeded/Merged features for plan: ${planId}`);
    }

    // 3. Seed Localized Prices
    logger.info('[Seeder] Seeding country localized prices...');
    const dummyMode = isSeederDummyMode();
    const rzp = !dummyMode ? getRazorpayClient() : null;

    for (const price of DEFAULT_PRICES) {
      const docId = `${price.planId}_${price.country}`;

      // If we have live credentials and the plan ID is a dummy placeholder, register it dynamically on Razorpay!
      if (!dummyMode && rzp) {
        try {
          if (price.razorpayMonthlyPlanId?.endsWith('_dummy')) {
            logger.info(`[Seeder] Registering live Razorpay Plan for ${docId} Monthly...`);
            const rzpPlan = await rzp.plans.create({
              period: 'monthly',
              interval: 1,
              item: {
                name: `${price.planId.replace('plan_', '')} ${price.country} Monthly`.toUpperCase(),
                amount: price.monthlyPrice * 100, // paise / cents
                currency: price.currency,
                description: `OneRepute ${price.planId.replace('plan_', '')} Localized Plan`
              }
            });
            price.razorpayMonthlyPlanId = rzpPlan.id;
            logger.info(`[Seeder] Registered live Razorpay Plan ID: ${rzpPlan.id}`);
          }
          
          if (price.razorpayAnnualPlanId?.endsWith('_dummy')) {
            logger.info(`[Seeder] Registering live Razorpay Plan for ${docId} Annual...`);
            const rzpPlan = await rzp.plans.create({
              period: 'yearly',
              interval: 1,
              item: {
                name: `${price.planId.replace('plan_', '')} ${price.country} Annual`.toUpperCase(),
                amount: price.annualPrice * 100, // paise / cents
                currency: price.currency,
                description: `OneRepute ${price.planId.replace('plan_', '')} Localized Plan`
              }
            });
            price.razorpayAnnualPlanId = rzpPlan.id;
            logger.info(`[Seeder] Registered live Razorpay Plan ID: ${rzpPlan.id}`);
          }
        } catch (planError) {
          logger.error(`[Seeder] Failed to register plan dynamically on Razorpay for ${docId}`, { error: planError.message });
        }
      }

      await db.collection(PRICES_COLLECTION).doc(docId).set({
        ...price,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      logger.info(`[Seeder] Seeded/Merged localized price: ${docId} (${price.currency})`);
    }

    logger.info('[Seeder] Database checks & seeding completed successfully.');
  } catch (error) {
    logger.error('[Seeder] Seeding failed with error', { error: error.message, stack: error.stack });
  }
}

module.exports = { seedDatabase };
