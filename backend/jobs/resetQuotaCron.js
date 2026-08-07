/**
 * jobs/resetQuotaCron.js
 *
 * Daily scheduler checking subscription renewal milestones.
 * Resets monthly counters and executes delayed plan downgrades at cycle boundaries.
 */

'use strict';

const cron = require('node-cron');
const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');
const { invalidateCache } = require('../services/permissionService');

async function checkAndResetQuotas() {
  logger.info('[ResetQuotaCron] Starting daily subscription quota reset check');
  const db = getDb();
  const now = Date.now();

  try {
    const customersSnap = await db.collection('customers')
      .where('subscriptionStatus', '==', 'active')
      .get();

    let resetCount = 0;
    let downgradeCount = 0;

    for (const doc of customersSnap.docs) {
      const customerId = doc.id;
      const customer = doc.data();

      if (!customer.renewalDate) continue;

      const renewalTime = customer.renewalDate.toDate 
        ? customer.renewalDate.toDate().getTime() 
        : new Date(customer.renewalDate).getTime();

      // Check if current renewal date has passed
      if (now >= renewalTime) {
        let isDowngrading = false;
        let finalPlan = customer.plan;
        let finalBillingCycle = customer.billingCycle || 'monthly';

        // 1. Process pending delayed downgrades
        if (customer.pendingPlanDowngrade) {
          finalPlan = customer.pendingPlanDowngrade.plan;
          finalBillingCycle = customer.pendingPlanDowngrade.billingCycle || 'monthly';
          isDowngrading = true;
          downgradeCount++;

          logger.info('[ResetQuotaCron] Executing scheduled plan downgrade', {
            customerId,
            from: customer.plan,
            to: finalPlan,
          });
        }

        // Calculate next renewal date
        const cycleDays = finalBillingCycle === 'annual' ? 365 : 30;
        const nextRenewalDate = admin.firestore.Timestamp.fromMillis(Date.now() + cycleDays * 24 * 60 * 60 * 1000);

        // Update customer subscription data
        const customerUpdate = {
          plan: finalPlan,
          billingCycle: finalBillingCycle,
          renewalDate: nextRenewalDate,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (isDowngrading) {
          customerUpdate.pendingPlanDowngrade = null;
        }

        await db.collection('customers').doc(customerId).update(customerUpdate);

        // 2. Reset monthly usage counters in customerUsage
        const usageRef = db.collection('customerUsage').doc(customerId);
        const usageSnap = await usageRef.get();

        if (usageSnap.exists) {
          await usageRef.update({
            review_reply_count: 0, // Reset review replies count
            resetDate: nextRenewalDate,
            currentMonth: new Date().toISOString().slice(0, 7),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } else {
          await usageRef.set({
            customerId,
            review_reply_count: 0,
            smart_qr_count: 0,
            competitor_count: 0,
            team_member_count: 0,
            resetDate: nextRenewalDate,
            currentMonth: new Date().toISOString().slice(0, 7),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }

        resetCount++;
        logger.info('[ResetQuotaCron] Reset quota counters for customer', { customerId });
      }
    }

    if (downgradeCount > 0 || resetCount > 0) {
      invalidateCache();
    }

    logger.info('[ResetQuotaCron] Completed checking subscription cycles', { resetCount, downgradeCount });
  } catch (err) {
    logger.error('[ResetQuotaCron] Failed to run quota reset check', { error: err.message, stack: err.stack });
  }
}

function initQuotaCron() {
  logger.info('[ResetQuotaCron] Initialized daily quota reset cron job.');
  // Runs every day at midnight
  cron.schedule('0 0 * * *', checkAndResetQuotas);
}

module.exports = {
  initQuotaCron,
  checkAndResetQuotas,
};
