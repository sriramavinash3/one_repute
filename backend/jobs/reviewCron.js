/**
 * jobs/reviewCron.js
 *
 * Scheduled cron job that runs at 10:00, 15:00, and 21:00 to process
 * reviews for all active outlets.
 *
 * Safety guarantees:
 *  - Lock prevents overlapping runs (if one run takes > 5 min)
 *  - Errors in one outlet do NOT stop processing other outlets
 *  - All outcomes are logged to Firestore /logs
 */

'use strict';

const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const { acquireDistributedLock, releaseDistributedLock } = require('../utils/lock');
const outletRepo = require('../repositories/outletRepo');
const reviewService = require('../services/reviewService');
const reviewRepo = require('../repositories/reviewRepo');

const LOCK_KEY = 'reviewCron';
const JOB_NAME = 'ReviewAutomationJob';

// ─── Core Job Logic ───────────────────────────────────────────────────────────

async function runJob() {
  const jobStart = Date.now();
  logger.info(`[${JOB_NAME}] Starting run`);

  // Acquire distributed lock — skip run if already locked
  const locked = await acquireDistributedLock(LOCK_KEY, env.cron.lockTtlMs);
  if (!locked) {
    logger.warn(`[${JOB_NAME}] Previous run still active — skipping this tick`);
    return;
  }

  let outlets = [];
  const summary = { outlets: 0, totalFetched: 0, totalNew: 0, totalProcessed: 0, errors: 0 };

  try {
    // Fetch all active outlets
    outlets = await outletRepo.getActiveOutlets();
    summary.outlets = outlets.length;

    if (outlets.length === 0) {
      logger.info(`[${JOB_NAME}] No active outlets found — nothing to do`);
      return;
    }

    logger.info(`[${JOB_NAME}] Processing ${outlets.length} active outlet(s)`);

    // Process each outlet sequentially (not parallel) to respect API rate limits.
    // Within each outlet, reviews are processed in parallel batches.
    for (const outlet of outlets) {
      try {
        const result = await reviewService.processOutletReviews(outlet);
        summary.totalFetched += result.fetched;
        summary.totalNew += result.new;
        summary.totalProcessed += result.processed;
      } catch (outletErr) {
        // One outlet failing must not crash the entire job
        summary.errors++;
        logger.error(`[${JOB_NAME}] Outlet processing failed`, {
          outletId: outlet.id,
          error: outletErr.message,
        });

        await reviewRepo.writeLog({
          eventType: 'OUTLET_PROCESSING_FAILED',
          status: 'error',
          payload: { outletId: outlet.id, outletName: outlet.name },
          errorMessage: outletErr.message,
          stackTrace: outletErr.stack,
        });
      }
    }

    const durationMs = Date.now() - jobStart;
    logger.info(`[${JOB_NAME}] Run complete`, { ...summary, durationMs });

    await reviewRepo.writeLog({
      eventType: 'CRON_RUN_COMPLETE',
      status: 'success',
      payload: { ...summary, durationMs },
    });
  } catch (fatalErr) {
    // Unexpected top-level error (e.g., Firestore unreachable)
    logger.error(`[${JOB_NAME}] Fatal error in cron run`, {
      error: fatalErr.message,
      stack: fatalErr.stack,
    });

    await reviewRepo.writeLog({
      eventType: 'CRON_RUN_FAILED',
      status: 'error',
      payload: { durationMs: Date.now() - jobStart },
      errorMessage: fatalErr.message,
      stackTrace: fatalErr.stack,
    });
  } finally {
    // ALWAYS release the lock, even if the job crashed
    await releaseDistributedLock(LOCK_KEY);
    logger.debug(`[${JOB_NAME}] Lock released`);
  }
}

// ─── Cron Scheduler ──────────────────────────────────────────────────────────

/**
 * Start the cron job with the configured schedule.
 * Called once at application startup.
 */
function startCron() {
  const schedule = env.cron.schedule;

  if (!cron.validate(schedule)) {
    throw new Error(`[${JOB_NAME}] Invalid cron schedule: "${schedule}"`);
  }

  logger.info(`[${JOB_NAME}] Scheduling with pattern: "${schedule}"`);

  const task = cron.schedule(schedule, async () => {
    try {
      await runJob();
    } catch (err) {
      // Catch any error that escapes runJob (should not happen, but belt & suspenders)
      logger.error(`[${JOB_NAME}] Uncaught error in scheduled task`, {
        error: err.message,
        stack: err.stack,
      });
    }
  });

  logger.info(`[${JOB_NAME}] Cron started`);
  return task;
}

/**
 * Manually trigger one job run — useful for testing or backfill.
 */
async function triggerNow() {
  logger.info(`[${JOB_NAME}] Manual trigger invoked`);
  await runJob();
}

module.exports = { startCron, triggerNow };
