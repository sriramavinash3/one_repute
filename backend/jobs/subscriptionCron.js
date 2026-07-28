/**
 * jobs/subscriptionCron.js
 *
 * Runs daily to check for trial expirations and flag accounts as churn risk.
 */

'use strict';

const cron = require('node-cron');
const { getDb } = require('../config/firebase');
const logger = require('../utils/logger');
const customerRepo = require('../repositories/customerRepo');

async function processSubscriptions() {
  logger.info('[SubscriptionCron] Starting daily subscription & trial check');
  const db = getDb();

  try {
    const customers = await customerRepo.getAllCustomers();
    const now = Date.now();
    const fifteenDays = 15 * 24 * 60 * 60 * 1000;

    let expiredCount = 0;
    let churnRiskCount = 0;

    for (const customer of customers) {
      let updates = {};

      // 1. Check Trial Expiration
      if (customer.accountStatus === 'Trial' && customer.trialEndDate) {
        const endDate = customer.trialEndDate.toDate ? customer.trialEndDate.toDate().getTime() : new Date(customer.trialEndDate).getTime();
        if (now > endDate) {
          updates.accountStatus = 'Inactive';
          updates.paymentStatus = 'Unpaid';
          expiredCount++;
        }
      }

      // 2. Check Churn Risk (Not used in 15 days or very low usage)
      const lastActivity = customer.lastActivity ? (customer.lastActivity.toDate ? customer.lastActivity.toDate().getTime() : new Date(customer.lastActivity).getTime()) : 0;
      
      if (customer.accountStatus === 'Active' && lastActivity > 0 && (now - lastActivity) > fifteenDays) {
        updates.churnRisk = true;
        churnRiskCount++;
      }

      if (Object.keys(updates).length > 0) {
        await customerRepo.updateCustomer(customer.id, updates);
      }
    }

    logger.info('[SubscriptionCron] Completed', { expiredCount, churnRiskCount });
  } catch (err) {
    logger.error('[SubscriptionCron] Failed to process subscriptions', { error: err.message });
  }
}

// Schedule to run every day at midnight server time
function initSubscriptionCron() {
  logger.info('[SubscriptionCron] Initialized daily subscription cron job.');
  cron.schedule('0 0 * * *', processSubscriptions);
}

module.exports = {
  initSubscriptionCron,
  processSubscriptions
};
