/**
 * jobs/escalationCron.js
 *
 * Scheduled background worker that runs every minute to process multi-level escalations.
 */

'use strict';

const cron = require('node-cron');
const axios = require('axios');
const { getDb, admin } = require('../config/firebase');
const { acquireDistributedLock, releaseDistributedLock } = require('../utils/lock');
const escalationRepo = require('../repositories/escalationRepo');
const whatsappService = require('../services/whatsappService');
const emailBridge = require('../src/modules/email/email.integration');
const logger = require('../utils/logger');
const env = require('../config/env');

const LOCK_KEY = 'escalationCron';
const JOB_NAME = 'EscalationCronJob';

/**
 * Helper to check plan limits
 */
function getMaxAllowedLevel(planName = '') {
  const plan = String(planName).toLowerCase();
  if (plan.includes('enterprise')) {
    return 3;
  }
  if (plan.includes('pro') || plan.includes('premium')) {
    return 2;
  }
  if (plan.includes('growth')) {
    return 1;
  }
  return 0; // Starter/default plan has no escalation levels
}

/**
 * Check if AI credits are exhausted
 */
async function checkCreditsExhausted() {
  if (!env.openai || !env.openai.apiKey) {
    return false;
  }
  try {
    const response = await axios.get('https://api.aicredits.in/api/v1/credits', {
      headers: {
        Authorization: `Bearer ${env.openai.apiKey}`,
      },
      timeout: 5000,
    });
    const data = response?.data?.data || {};
    return Number(data.total_usage || 0) >= Number(data.total_credits || 0);
  } catch (err) {
    logger.warn('[EscalationCron] Failed to fetch AI credits status', {
      error: err.message,
    });
    return false; // Fail safe (assume not exhausted if query fails)
  }
}

/**
 * Format timestamp relative to now
 */
function formatPendingTime(createdAt) {
  const time = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  const diffMs = Date.now() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `${diffHours}h ${diffMins % 60}m ago`;
  }
  return `${Math.floor(diffHours / 24)}d ago`;
}

/**
 * Core Job Execution Logic
 */
async function runJob() {
  const jobStart = Date.now();
  logger.info(`[${JOB_NAME}] Starting run`);

  // 1. Acquire distributed lock (TTL 50 seconds to prevent concurrent minute overlaps)
  const locked = await acquireDistributedLock(LOCK_KEY, 50000);
  if (!locked) {
    logger.warn(`[${JOB_NAME}] Previous run still active — skipping this tick`);
    return;
  }

  try {
    const db = getDb();

    // 2. Fetch all reviews that are actively pending escalation
    const reviewsSnap = await db.collection('reviews')
      .where('escalationStatus', 'in', ['level_1_pending', 'level_2_pending', 'level_3_pending'])
      .get();

    const reviews = reviewsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    if (reviews.length === 0) {
      logger.debug(`[${JOB_NAME}] No reviews in escalation pipeline — finished`);
      return;
    }

    logger.info(`[${JOB_NAME}] Checking ${reviews.length} active review(s) in escalation pipeline`);

    const now = Date.now();

    for (const review of reviews) {
      try {
        // Fetch parent customer details
        if (!review.customerId) {
          logger.warn(`[${JOB_NAME}] Review missing customerId, skipping`, { reviewId: review.id });
          continue;
        }

        const customerDoc = await db.collection('customers').doc(review.customerId).get();
        if (!customerDoc.exists) {
          logger.warn(`[${JOB_NAME}] Customer profile not found for review, skipping`, { reviewId: review.id, customerId: review.customerId });
          continue;
        }
        const customer = customerDoc.data();

        // 3. AUTO STOP RULES
        // Check if replied on source or resolved in platform
        const hasReply = review.repliedAt || review.aiResponse || review.replySuggestion || review.status === 'responded';
        const isResolved = review.status === 'resolved' || review.status === 'archived' || review.status === 'deleted';
        const isMasterDisabled = !customer.whatsappEscalationEnabled;
        const isSubscriptionExpired = customer.subscriptionStatus !== 'active' && customer.subscriptionStatus !== 'trialing';

        const maxAllowed = getMaxAllowedLevel(customer.plan);
        const currentLevel = review.escalationCurrentLevel || 1;
        const isPlanRestricted = currentLevel > maxAllowed;

        const creditsExhausted = await checkCreditsExhausted();

        // If Stop Conditions are met
        if (hasReply || isResolved || isMasterDisabled || isSubscriptionExpired || isPlanRestricted || creditsExhausted) {
          let finalStatus = 'resolved';
          let reason = 'Review Resolved';

          if (isMasterDisabled) {
            reason = 'Escalation Disabled by Customer';
            finalStatus = 'no_escalation';
          } else if (isSubscriptionExpired) {
            reason = 'Subscription Expired';
            finalStatus = 'completed';
          } else if (isPlanRestricted) {
            reason = 'Plan level limit restricted';
            finalStatus = 'completed';
          } else if (creditsExhausted) {
            reason = 'AI Review Credits Exhausted';
            finalStatus = 'completed';

            // Auto-toggle off master switch
            await db.collection('customers').doc(review.customerId).update({
              whatsappEscalationEnabled: false,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Log credit exhaustion to audits
            await db.collection('activityLogs').add({
              type: 'ESCALATION_AUTO_DISABLED_CREDITS_EXHAUSTED',
              payload: { customerId: review.customerId },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          }

          // Update review status
          await db.collection('reviews').doc(review.id).update({
            escalationStatus: finalStatus,
            nextEscalationTime: null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Log stop event audit
          await db.collection('activityLogs').add({
            type: 'ESCALATION_CANCELLED',
            payload: { reviewId: review.id, customerId: review.customerId, reason },
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });

          logger.info(`[${JOB_NAME}] Stopped escalation for review`, { reviewId: review.id, reason });
          continue;
        }

        // 4. TIMER CHECK: nextEscalationTime <= now
        const nextTime = review.nextEscalationTime?.toDate ? review.nextEscalationTime.toDate().getTime() : new Date(review.nextEscalationTime).getTime();

        if (now >= nextTime) {
          logger.info(`[${JOB_NAME}] Escalation Timer Triggered`, { reviewId: review.id, level: currentLevel });

          // Retrieve active config for this level
          const setting = await escalationRepo.getSettingByCustomerAndLevel(review.customerId, currentLevel);

          if (setting && setting.enabled) {
            const pendingSince = formatPendingTime(review.reviewTimestamp || review.createdAt || now);
            const dashboardUrl = `${env.APP_URL || 'https://onerepute.com'}/outlet-dashboard/reviews`;

            // A. Send WhatsApp Alert
            if (setting.whatsappNumber) {
              const fullNumber = `${setting.countryCode}${setting.whatsappNumber}`.replace(/\s+/g, '');
              try {
                await whatsappService.sendEscalationAlert({
                  toNumber: fullNumber,
                  businessName: customer.name || 'Your Business',
                  customerName: review.customerName || 'Valued Customer',
                  rating: Number(review.rating || 1),
                  reviewText: review.text || '(No text)',
                  pendingSince,
                  level: currentLevel,
                  dashboardUrl,
                });

                await escalationRepo.saveHistory({
                  reviewId: review.id,
                  customerId: review.customerId,
                  level: currentLevel,
                  recipientName: setting.name,
                  recipientWhatsApp: fullNumber,
                  recipientEmail: setting.email || null,
                  channel: 'WhatsApp',
                  status: 'success',
                  deliveryStatus: 'sent',
                });
              } catch (waErr) {
                logger.error(`[${JOB_NAME}] WhatsApp notification failed`, { reviewId: review.id, error: waErr.message });
                await escalationRepo.saveHistory({
                  reviewId: review.id,
                  customerId: review.customerId,
                  level: currentLevel,
                  recipientName: setting.name,
                  recipientWhatsApp: fullNumber,
                  recipientEmail: setting.email || null,
                  channel: 'WhatsApp',
                  status: 'error',
                  deliveryStatus: 'failed',
                  errorMessage: waErr.message,
                });
              }
            }

            // B. Send Email Alert (If configured)
            if (setting.email) {
              try {
                await emailBridge.queueEscalationEmail(
                  setting.email,
                  currentLevel,
                  customer.name || 'Your Business',
                  review.customerName || 'Valued Customer',
                  Number(review.rating || 1),
                  review.text || '(No text)',
                  pendingSince
                );

                await escalationRepo.saveHistory({
                  reviewId: review.id,
                  customerId: review.customerId,
                  level: currentLevel,
                  recipientName: setting.name,
                  recipientWhatsApp: `${setting.countryCode}${setting.whatsappNumber}`.replace(/\s+/g, ''),
                  recipientEmail: setting.email,
                  channel: 'Email',
                  status: 'success',
                  deliveryStatus: 'sent',
                });
              } catch (mailErr) {
                logger.error(`[${JOB_NAME}] Email notification failed`, { reviewId: review.id, error: mailErr.message });
                await escalationRepo.saveHistory({
                  reviewId: review.id,
                  customerId: review.customerId,
                  level: currentLevel,
                  recipientName: setting.name,
                  recipientWhatsApp: `${setting.countryCode}${setting.whatsappNumber}`.replace(/\s+/g, ''),
                  recipientEmail: setting.email,
                  channel: 'Email',
                  status: 'error',
                  deliveryStatus: 'failed',
                  errorMessage: mailErr.message,
                });
              }
            }

            // Log activity audit
            await db.collection('activityLogs').add({
              type: 'ESCALATION_SENT',
              payload: { reviewId: review.id, level: currentLevel, recipientName: setting.name },
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            logger.warn(`[${JOB_NAME}] Escalation level is configured but disabled or missing`, { reviewId: review.id, level: currentLevel });
          }

          // 5. DETERMINE NEXT ESCALATION TIMER OR COMPLETE
          const nextLevel = currentLevel + 1;
          const nextAllowed = getMaxAllowedLevel(customer.plan);

          if (nextLevel <= 3 && nextLevel <= nextAllowed) {
            // Check if settings exist for the next level
            const nextSetting = await escalationRepo.getSettingByCustomerAndLevel(review.customerId, nextLevel);
            
            if (nextSetting && nextSetting.enabled) {
              // Calculate next escalation timestamp relative to review.createdAt or review.reviewTimestamp
              const startTime = review.reviewTimestamp?.toDate ? review.reviewTimestamp.toDate().getTime() : (review.createdAt?.toDate ? review.createdAt.toDate().getTime() : now);
              const nextTimeMs = startTime + (nextSetting.escalationMinutes * 60 * 1000);

              await db.collection('reviews').doc(review.id).update({
                escalationStatus: `level_${nextLevel}_pending`,
                escalationCurrentLevel: nextLevel,
                nextEscalationTime: admin.firestore.Timestamp.fromMillis(nextTimeMs),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });

              // Log transition to audits
              await db.collection('activityLogs').add({
                type: 'ESCALATION_TRANSITIONED',
                payload: { reviewId: review.id, level: nextLevel, nextEscalationTime: new Date(nextTimeMs).toISOString() },
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
              });

              logger.info(`[${JOB_NAME}] Advanced escalation to level`, { reviewId: review.id, nextLevel });
            } else {
              // Next level settings missing or disabled -> complete
              await db.collection('reviews').doc(review.id).update({
                escalationStatus: 'completed',
                nextEscalationTime: null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
              });
              logger.info(`[${JOB_NAME}] Next level config missing or disabled. Marked completed.`, { reviewId: review.id });
            }
          } else {
            // Reached level 3 or max allowed levels -> complete
            await db.collection('reviews').doc(review.id).update({
              escalationStatus: 'completed',
              nextEscalationTime: null,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            logger.info(`[${JOB_NAME}] Max escalation level reached. Marked completed.`, { reviewId: review.id });
          }
        }
      } catch (reviewErr) {
        logger.error(`[${JOB_NAME}] Error processing escalation for single review`, {
          reviewId: review.id,
          error: reviewErr.message,
          stack: reviewErr.stack,
        });
      }
    }
  } catch (fatalErr) {
    logger.error(`[${JOB_NAME}] Fatal error executing escalation cron`, {
      error: fatalErr.message,
      stack: fatalErr.stack,
    });
  } finally {
    await releaseDistributedLock(LOCK_KEY);
    logger.debug(`[${JOB_NAME}] Released lock`);
  }
}

/**
 * Start node-cron scheduled execution
 */
function startCron() {
  logger.info(`[${JOB_NAME}] Starting schedule: Every minute (* * * * *)`);
  const task = cron.schedule('* * * * *', async () => {
    try {
      await runJob();
    } catch (err) {
      logger.error(`[${JOB_NAME}] Uncaught error in scheduled task`, {
        error: err.message,
        stack: err.stack,
      });
    }
  });
  return task;
}

module.exports = { startCron, triggerNow: runJob };
