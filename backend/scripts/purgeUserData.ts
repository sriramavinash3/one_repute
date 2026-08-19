/**
 * scripts/purgeUserData.ts
 *
 * Production & Local Full User Data Purge CLI Tool for OneRepute.
 *
 * Usage:
 *   Dry-run audit:
 *     npm run db:purge -- --dry-run
 *
 *   Purge Local User Data:
 *     npm run db:purge -- --confirm="PURGE LOCAL USER DATA"
 *
 *   Purge Production User Data:
 *     npm run db:purge -- --confirm="PURGE PRODUCTION USER DATA"
 *
 *   Interactive mode:
 *     npm run db:purge
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as readline from 'readline';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PurgeService } from '../src/modules/purge/purge.service';

dotenv.config({ path: path.join(__dirname, '../.env') });

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    }),
  );
}

async function runCli() {
  console.log('\n============================================================');
  console.log('    ONEREPUTE — PRODUCTION & LOCAL FULL USER DATA PURGE');
  console.log('============================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const purgeService = app.get(PurgeService);

  const isDryRunOnly = process.argv.includes('--dry-run');
  const confirmArgIndex = process.argv.findIndex((arg) => arg.startsWith('--confirm='));
  let confirmInput = confirmArgIndex !== -1 ? process.argv[confirmArgIndex].split('=')[1].replace(/^["']|["']$/g, '') : '';

  // Step 1: Perform Dry-Run Audit
  console.log('STEP 1: Performing Pre-Purge Dry-Run Audit...\n');
  const summary = await purgeService.getDryRunSummary();

  console.log(`Target Environment  : ${summary.environment} (${summary.nodeEnv})`);
  console.log(`Database Target     : ${summary.databaseTarget}`);
  console.log(`Firebase Project ID : ${summary.firebaseProjectId}`);
  console.log(`Timestamp           : ${summary.timestamp}`);
  console.log(`Required Phrase     : "${summary.requiredConfirmation}"\n`);

  console.log('------------------------------------------------------------');
  console.log(' Protected System Records (WILL BE PRESERVED)');
  console.log('------------------------------------------------------------');
  console.log(` - Admin Accounts    : ${summary.protectedRecords.adminAccounts.join(', ')}`);
  console.log(` - Pricing Plans     : ${summary.protectedRecords.plansCount} plans preserved`);
  console.log(` - System Config     : ${summary.protectedRecords.systemConfigIntact ? 'INTACT' : 'NOT FOUND'}\n`);

  console.log('------------------------------------------------------------');
  console.log(' User-Owned Application Data (PERMANENT DELETION SCOPE)');
  console.log('------------------------------------------------------------');
  const counts = summary.deletionScopeCounts;
  console.log(` - Firebase Auth Users       : ${counts.authUsersToDelete}`);
  console.log(` - Firestore User Docs       : ${counts.firestoreUsersToDelete}`);
  console.log(` - PostgreSQL User Rows      : ${counts.postgresUsersToDelete}`);
  console.log(` - Outlets / Locations       : ${counts.outlets}`);
  console.log(` - Customers                 : ${counts.customers}`);
  console.log(` - Reviews                   : ${counts.reviews}`);
  console.log(` - Sync History Records      : ${counts.syncHistory}`);
  console.log(` - Analytics Snapshots       : ${counts.analyticsSnapshots}`);
  console.log(` - Subscriptions             : ${counts.subscriptions}`);
  console.log(` - Invoices                  : ${counts.invoices}`);
  console.log(` - Payments                  : ${counts.payments}`);
  console.log(` - Transactions              : ${counts.transactions}`);
  console.log(` - Activity & Audit Logs     : ${counts.activityLogs}`);
  console.log(` - Notification Logs         : ${counts.notificationLogs}`);
  console.log(` - Uploaded Asset Files      : ${counts.uploadedFiles}`);
  console.log(` - Background Queue Jobs     : ${counts.queueJobs}`);
  console.log(` - Redis Cache Keys          : ${counts.redisKeys}`);
  console.log('------------------------------------------------------------\n');

  if (isDryRunOnly) {
    console.log('✅ Dry-run audit complete. No data was deleted.\n');
    await app.close().catch(() => {});
    process.exit(0);
  }

  // Step 2: Confirmation Check
  if (!confirmInput) {
    console.log('⚠️ MANDATORY CONFIRMATION REQUIRED!');
    console.log(`To purge ${summary.environment} user data, type exactly:\n`);
    console.log(`  "${summary.requiredConfirmation}"\n`);

    confirmInput = await askQuestion('Enter confirmation phrase > ');
  }

  if (confirmInput !== summary.requiredConfirmation) {
    console.error(`\n❌ PURGE ABORTED: Confirmation string "${confirmInput}" does not match required phrase "${summary.requiredConfirmation}".`);
    await app.close().catch(() => {});
    process.exit(1);
  }

  // Step 3: Execute Purge
  console.log(`\nSTEP 2: Executing Full ${summary.environment} Data Purge in Dependency Order...\n`);

  try {
    const result = await purgeService.executePurge({ confirmation: confirmInput });

    console.log('============================================================');
    console.log('                 PURGE EXECUTION SUMMARY');
    console.log('============================================================');
    console.log(` - Status                     : ${result.success ? '✅ SUCCESS' : '⚠️ COMPLETED WITH WARNINGS'}`);
    console.log(` - Environment                : ${result.environment}`);
    console.log(` - Auth Users Removed         : ${result.deletedCounts.authUsers}`);
    console.log(` - Firestore User Docs Removed: ${result.deletedCounts.firestoreUsers}`);
    console.log(` - PostgreSQL User Rows Rem   : ${result.deletedCounts.postgresUsers}`);
    console.log(` - Outlets Removed            : ${result.deletedCounts.outlets}`);
    console.log(` - Customers Removed          : ${result.deletedCounts.customers}`);
    console.log(` - Reviews Removed            : ${result.deletedCounts.reviews}`);
    console.log(` - Subscriptions Removed      : ${result.deletedCounts.subscriptions}`);
    console.log(` - Financial Records Removed  : ${result.deletedCounts.financialRecords}`);
    console.log(` - Logs Cleared               : ${result.deletedCounts.logRecords}`);
    console.log(` - Asset Files Removed        : ${result.deletedCounts.uploadedFiles}`);
    console.log(` - Queue Jobs Cleared         : ${result.deletedCounts.queueJobs}`);
    console.log(` - Redis Cache Keys Cleared   : ${result.deletedCounts.redisKeys}`);
    console.log('============================================================\n');

    console.log('============================================================');
    console.log('              POST-PURGE AUTOMATED VERIFICATION');
    console.log('============================================================');
    console.log(` - Remaining Normal Users     : ${result.verification.remainingUsers}  (Expected: 0) ${result.verification.remainingUsers === 0 ? '✅' : '❌'}`);
    console.log(` - Remaining Outlets          : ${result.verification.remainingOutlets}  (Expected: 0) ${result.verification.remainingOutlets === 0 ? '✅' : '❌'}`);
    console.log(` - Remaining Customers        : ${result.verification.remainingCustomers}  (Expected: 0) ${result.verification.remainingCustomers === 0 ? '✅' : '❌'}`);
    console.log(` - Remaining Reviews          : ${result.verification.remainingReviews}  (Expected: 0) ${result.verification.remainingReviews === 0 ? '✅' : '❌'}`);
    console.log(` - Remaining Subscriptions    : ${result.verification.remainingSubscriptions}  (Expected: 0) ${result.verification.remainingSubscriptions === 0 ? '✅' : '❌'}`);
    console.log(` - Admin Account Intact       : ${result.verification.adminAccountIntact ? 'YES ✅' : 'NO ❌'}`);
    console.log(` - Plans & Configuration      : ${result.verification.plansIntact ? 'INTACT ✅' : 'WARNING ⚠️'}`);
    console.log(` - Database Schema Intact     : ${result.verification.schemaIntact ? 'INTACT ✅' : 'WARNING ⚠️'}`);
    console.log('============================================================\n');

    if (result.success) {
      console.log('🎉 PURGE COMPLETE: Application is cleanly reset for new customer signups!');
    } else {
      console.warn('⚠️ PURGE COMPLETED WITH WARNINGS. Review details above.');
    }
  } catch (err: any) {
    console.error(`\n❌ PURGE FAILED: ${err.message}`);
    await app.close();
    process.exit(1);
  }

  await app.close().catch(() => {});
  process.exit(0);
}

runCli().catch((err) => {
  console.error('\nFATAL CLI ERROR:', err);
  process.exit(1);
});
