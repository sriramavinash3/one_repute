/**
 * server.js
 *
 * Application entry point.
 *  - Loads environment variables
 *  - Starts HTTP server
 *  - Starts cron scheduler
 *  - Registers global process-level error handlers
 */

'use strict';

// Load .env FIRST — before any other require
require('dotenv').config();

const { getDb } = require('./config/firebase');
// Initialize Firebase immediately so admin.auth() is available for incoming requests
getDb();

const app = require('./app');
const { startCron } = require('./jobs/reviewCron');
const { initReportJobs } = require('./jobs/reportCron');
const { initSubscriptionCron } = require('./jobs/subscriptionCron');
const logger = require('./utils/logger');
const env = require('./config/env');

// ─── Start HTTP Server ────────────────────────────────────────────────────────

const server = app.listen(env.PORT, () => {
  logger.info(`[Server] HTTP server running on port ${env.PORT}`, {
    environment: env.NODE_ENV,
  });
});

// ─── Start Cron Scheduler ─────────────────────────────────────────────────────

try {
  startCron();
  initReportJobs();
  initSubscriptionCron();
} catch (err) {
  logger.error('[Server] Failed to start cron job — shutting down', { error: err.message });
  process.exit(1);
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  logger.info(`[Server] Received ${signal} — graceful shutdown initiated`);

  server.close((err) => {
    if (err) {
      logger.error('[Server] Error during HTTP server shutdown', { error: err.message });
      process.exit(1);
    }
    logger.info('[Server] HTTP server closed');
    process.exit(0);
  });

  // Force-kill after 15 seconds if graceful shutdown hangs
  setTimeout(() => {
    logger.error('[Server] Graceful shutdown timed out — force exiting');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // Docker / Kubernetes stop
process.on('SIGINT', () => gracefulShutdown('SIGINT'));   // Ctrl+C

// ─── Global Process Error Handlers ───────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.error('[Process] Uncaught Exception — application state may be corrupt', {
    error: err.message,
    stack: err.stack,
  });
  // For uncaught exceptions, safest to exit and let the process manager restart
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  // Do NOT exit here — rejections may be recoverable; just log them
});
