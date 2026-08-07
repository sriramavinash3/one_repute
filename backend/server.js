/**
 * server.js
 *
 * Application entry point for OneRepute backend.
 * Boots NestJS Application (which includes AuthController & Resend Email Engine)
 * and initializes background cron schedulers.
 */

'use strict';

// Load .env FIRST
require('dotenv').config();

const { getDb } = require('./config/firebase');
getDb();

// Seed baseline plans and features
const { seedDatabase } = require('./utils/seeder');
seedDatabase();

const { startCron } = require('./jobs/reviewCron');
const { initReportJobs } = require('./jobs/reportCron');
const { initSubscriptionCron } = require('./jobs/subscriptionCron');
const { initQuotaCron } = require('./jobs/resetQuotaCron');
const escalationCron = require('./jobs/escalationCron');
const logger = require('./utils/logger');

// Load compiled NestJS main entrypoint
try {
  const { bootstrap } = require('./dist/src/main.js');
  bootstrap();
  logger.info('[Server] Successfully initialized NestJS backend server engine');
} catch (err) {
  logger.warn('[Server] Direct TS main fallback, compiling TypeScript on the fly...');
  require('ts-node/register');
  const { bootstrap } = require('./src/main.ts');
  bootstrap();
}

// ─── Start Cron Scheduler ─────────────────────────────────────────────────────

try {
  startCron();
  initReportJobs();
  initSubscriptionCron();
  initQuotaCron();
  escalationCron.startCron();
} catch (err) {
  logger.error('[Server] Cron initialization note:', { error: err.message });
}

// ─── Global Process Error Handlers ───────────────────────────────────────────

process.on('uncaughtException', (err) => {
  logger.error('[Process] Uncaught Exception', {
    error: err.message,
    stack: err.stack,
  });
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});
