/**
 * freshStartReset.ts
 *
 * Safe Fresh Start / Database Reset script for OneRepute.
 *
 * Completely wipes all customer accounts, outlets, reviews, operational logs,
 * subscriptions, transactions, and user data while preserving system admins,
 * pricing plans, migrations, and app configurations.
 *
 * Usage:
 *   npm run db:fresh-start -- --confirm-fresh-start
 *   or: ALLOW_FRESH_START=true npm run db:fresh-start
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import * as admin from 'firebase-admin';

dotenv.config({ path: path.join(__dirname, '../.env') });

const ADMIN_EMAIL = 'admin@onerepute.com';

// ─── Phase 1: Environment & Confirmation Checks ──────────────────────────────

function checkEnvironmentGuards() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();
  
  if (env === 'production') {
    console.error('\n❌ CRITICAL SAFETY ERROR: Cannot run db:fresh-start in PRODUCTION environment!');
    console.error('The reset script is intended ONLY for development and staging environments.\n');
    process.exit(1);
  }

  const hasConfirmFlag = process.argv.includes('--confirm-fresh-start');
  const hasEnvFlag = process.env.ALLOW_FRESH_START === 'true';

  if (!hasConfirmFlag && !hasEnvFlag) {
    console.error('\n⚠️ ACCIDENTAL EXECUTION SAFEGUARD: Explicit confirmation required!');
    console.error('To run this fresh start reset, you MUST provide explicit confirmation:');
    console.error('   npm run db:fresh-start -- --confirm-fresh-start');
    console.error('or:');
    console.error('   ALLOW_FRESH_START=true npm run db:fresh-start\n');
    process.exit(1);
  }
}

// ─── Init Database Clients ───────────────────────────────────────────────────

let prisma: PrismaClient | null = null;
let firebaseDb: admin.firestore.Firestore | null = null;
let firebaseAuth: admin.auth.Auth | null = null;

function initClients() {
  if (process.env.DATABASE_URL) {
    try {
      prisma = new PrismaClient();
      console.log('✅ Prisma client initialized.');
    } catch (err: any) {
      console.warn(`⚠️ Prisma client initialization skipped: ${err.message}`);
    }
  } else {
    console.log('ℹ️ DATABASE_URL not set in environment — skipping Prisma PostgreSQL reset.');
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    try {
      if (admin.apps.length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
          projectId,
        });
      }
      firebaseDb = admin.firestore();
      firebaseAuth = admin.auth();
      console.log('✅ Firebase Admin SDK initialized.');
    } catch (err: any) {
      console.warn(`⚠️ Firebase Admin initialization warning: ${err.message}`);
    }
  } else {
    console.log('ℹ️ Firebase environment variables missing — skipping Firestore reset.');
  }
}

// ─── Helpers for Firestore ────────────────────────────────────────────────────

async function fetchFirestoreDocs(collectionName: string) {
  if (!firebaseDb) return [];
  try {
    const snap = await firebaseDb.collection(collectionName).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (err) {
    return [];
  }
}

async function batchDeleteFirestoreCollection(collectionName: string, filterFn: ((doc: admin.firestore.QueryDocumentSnapshot) => boolean) | null = null) {
  if (!firebaseDb) return 0;
  try {
    const snap = await firebaseDb.collection(collectionName).get();
    let docsToDelete = snap.docs;
    if (filterFn) {
      docsToDelete = docsToDelete.filter(filterFn);
    }

    let deletedCount = 0;
    const chunkSize = 400;
    for (let i = 0; i < docsToDelete.length; i += chunkSize) {
      const batch = firebaseDb.batch();
      const chunk = docsToDelete.slice(i, i + chunkSize);
      chunk.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deletedCount += chunk.length;
    }
    return deletedCount;
  } catch (err: any) {
    console.warn(`⚠️ Error deleting collection '${collectionName}': ${err.message}`);
    return 0;
  }
}

async function listAllAuthUsers() {
  if (!firebaseAuth) return [];
  const users: admin.auth.UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const res = await firebaseAuth.listUsers(1000, pageToken);
    users.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);
  return users;
}

// ─── Main Execution ─────────────────────────────────────────────────────────

async function runReset() {
  checkEnvironmentGuards();
  initClients();

  console.log('\n============================================================');
  console.log('       ONEREPUTE FRESH START / DATABASE RESET ENGINE');
  console.log('============================================================\n');

  // ── Step 1: Pre-deletion Audit Summary ───────────────────────────────────

  console.log('STEP 1: Gathering Pre-Deletion Record Summary...');

  const prismaAudit: Record<string, number> = {};
  if (prisma) {
    try {
      prismaAudit['reviews'] = await prisma.review.count();
      prismaAudit['sync_history'] = await prisma.syncHistory.count();
      prismaAudit['analytics_snapshots'] = await prisma.analyticsSnapshot.count();
      prismaAudit['payments'] = await prisma.payment.count();
      prismaAudit['transactions'] = await prisma.transaction.count();
      prismaAudit['invoices'] = await prisma.invoice.count();
      prismaAudit['subscriptions'] = await prisma.subscription.count();
      prismaAudit['verification_tokens'] = await prisma.verificationToken.count();
      prismaAudit['password_reset_tokens'] = await prisma.passwordResetToken.count();
      prismaAudit['team_invitations'] = await prisma.teamInvitation.count();
      prismaAudit['email_logs'] = await prisma.emailLog.count();
      prismaAudit['locations'] = await prisma.location.count();
      prismaAudit['users (non-admin)'] = await prisma.user.count({
        where: {
          role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
          email: { not: ADMIN_EMAIL },
        },
      });
      prismaAudit['plans (PRESERVED)'] = await prisma.plan.count();
    } catch (err: any) {
      console.warn(`⚠️ Prisma pre-audit warning: ${err.message}`);
    }
  }

  const firestoreAudit: Record<string, number> = {};
  const firestoreCollections = [
    'reviews',
    'sync_history',
    'syncHistory',
    'analytics_snapshots',
    'analyticsSnapshots',
    'analytics',
    'escalationSettings',
    'escalationDispatches',
    'activityLogs',
    'notificationLogs',
    'customerUsage',
    'supportTickets',
    'reports',
    'invoices',
    'payments',
    'transactions',
    'subscriptions',
    'team_invitations',
    'invitations',
    'outlets',
    'customers',
  ];

  if (firebaseDb) {
    for (const col of firestoreCollections) {
      const docs = await fetchFirestoreDocs(col);
      firestoreAudit[col] = docs.length;
    }
    const firestoreUsers = await fetchFirestoreDocs('users');
    const nonAdminFsUsers = firestoreUsers.filter((u: any) => (u.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase() && u.role !== 'admin' && u.role !== 'super_admin');
    firestoreAudit['users (non-admin)'] = nonAdminFsUsers.length;
  }

  let authUsers: admin.auth.UserRecord[] = [];
  let nonAdminAuthUsers: admin.auth.UserRecord[] = [];
  if (firebaseAuth) {
    authUsers = await listAllAuthUsers();
    nonAdminAuthUsers = authUsers.filter(u => (u.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase());
  }

  console.log('\n--- Prisma PostgreSQL Records to Delete ---');
  if (Object.keys(prismaAudit).length > 0) {
    for (const [table, count] of Object.entries(prismaAudit)) {
      console.log(` - ${table.padEnd(28)} : ${count}`);
    }
  } else {
    console.log('   (No active Prisma connection)');
  }

  console.log('\n--- Firestore Collections Records to Delete ---');
  if (Object.keys(firestoreAudit).length > 0) {
    for (const [col, count] of Object.entries(firestoreAudit)) {
      console.log(` - ${col.padEnd(28)} : ${count}`);
    }
  } else {
    console.log('   (No active Firestore connection)');
  }

  console.log('\n--- Firebase Auth Accounts ---');
  console.log(` - Total Auth Users            : ${authUsers.length}`);
  console.log(` - Non-Admin Users to Delete   : ${nonAdminAuthUsers.length}`);
  console.log(` - Preserved Admin Account     : ${authUsers.some(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase()) ? `YES (${ADMIN_EMAIL})` : 'None found (will preserve if created)'}\n`);

  // ── Step 2: Perform Transactional Reset ────────────────────────────────────

  console.log('STEP 2: Executing Database Reset in Strict Dependency Order...\n');

  // 2.1 Prisma Transactional Reset
  if (prisma) {
    console.log(' -> Executing Prisma PostgreSQL reset inside transaction...');
    try {
      await prisma.$transaction(async (tx) => {
        // Delete dependent leaf tables first
        await tx.review.deleteMany({});
        await tx.syncHistory.deleteMany({});
        await tx.analyticsSnapshot.deleteMany({});
        await tx.payment.deleteMany({});
        await tx.transaction.deleteMany({});
        await tx.invoice.deleteMany({});
        await tx.subscription.deleteMany({});
        await tx.verificationToken.deleteMany({});
        await tx.passwordResetToken.deleteMany({});
        await tx.teamInvitation.deleteMany({});

        // Delete email logs for non-admin users
        const nonAdminUsers = await tx.user.findMany({
          where: {
            role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
            email: { not: ADMIN_EMAIL },
          },
          select: { id: true },
        });
        const nonAdminUserIds = nonAdminUsers.map(u => u.id);
        
        await tx.emailLog.deleteMany({
          where: {
            OR: [
              { userId: { in: nonAdminUserIds } },
              { user: null },
            ],
          },
        });

        // Delete locations / outlets
        await tx.location.deleteMany({});

        // Delete non-admin users
        await tx.user.deleteMany({
          where: {
            role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
            email: { not: ADMIN_EMAIL },
          },
        });
      });
      console.log('    ✅ Prisma PostgreSQL transaction completed successfully.');
    } catch (err: any) {
      console.error(`    ❌ Prisma PostgreSQL reset transaction failed: ${err.message}`);
      throw err;
    }
  }

  // 2.2 Firestore Batched Deletions
  if (firebaseDb) {
    console.log(' -> Executing Firestore batched collection deletions...');
    for (const col of firestoreCollections) {
      const count = await batchDeleteFirestoreCollection(col);
      console.log(`    Deleted ${count} documents from '${col}'.`);
    }

    // Delete non-admin Firestore users
    const fsUsersDeleted = await batchDeleteFirestoreCollection('users', (doc) => {
      const data = doc.data();
      const email = (data.email || '').toLowerCase();
      const role = (data.role || '').toLowerCase();
      return email !== ADMIN_EMAIL.toLowerCase() && role !== 'admin' && role !== 'super_admin';
    });
    console.log(`    Deleted ${fsUsersDeleted} non-admin user documents from Firestore.`);
  }

  // 2.3 Firebase Auth Deletion
  if (firebaseAuth && nonAdminAuthUsers.length > 0) {
    console.log(' -> Deleting non-admin accounts from Firebase Auth...');
    let authDeleted = 0;
    for (const user of nonAdminAuthUsers) {
      try {
        await firebaseAuth.deleteUser(user.uid);
        authDeleted++;
      } catch (err: any) {
        console.warn(`    Warning: Failed to delete auth user ${user.uid} (${user.email}): ${err.message}`);
      }
    }
    console.log(`    Deleted ${authDeleted} non-admin accounts from Firebase Auth.`);
  }

  // ── Step 3: Post-Reset Verification Audit ──────────────────────────────────

  console.log('\nSTEP 3: Verifying Clean State Post-Reset...\n');

  let remainingCustomersCount = 0;
  let remainingOutletsCount = 0;
  let remainingReviewsCount = 0;
  let remainingSubscriptionsCount = 0;
  let remainingNonAdminUsersCount = 0;
  let adminAccountIntact = false;

  if (prisma) {
    remainingReviewsCount += await prisma.review.count();
    remainingOutletsCount += await prisma.location.count();
    remainingSubscriptionsCount += await prisma.subscription.count();
    remainingNonAdminUsersCount += await prisma.user.count({
      where: {
        role: { notIn: ['ADMIN', 'SUPER_ADMIN'] },
        email: { not: ADMIN_EMAIL },
      },
    });
    const adminUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email: ADMIN_EMAIL },
          { role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        ],
      },
    });
    if (adminUser) adminAccountIntact = true;
  }

  if (firebaseDb) {
    const custDocs = await fetchFirestoreDocs('customers');
    const outletDocs = await fetchFirestoreDocs('outlets');
    const reviewDocs = await fetchFirestoreDocs('reviews');
    const subDocs = await fetchFirestoreDocs('subscriptions');

    remainingCustomersCount += custDocs.length;
    remainingOutletsCount += outletDocs.length;
    remainingReviewsCount += reviewDocs.length;
    remainingSubscriptionsCount += subDocs.length;
  }

  if (firebaseAuth) {
    const finalAuthUsers = await listAllAuthUsers();
    const adminAuth = finalAuthUsers.find(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
    if (adminAuth) adminAccountIntact = true;
  }

  console.log('============================================================');
  console.log('            VERIFICATION & FINAL AUDIT');
  console.log('============================================================');
  console.log(` - Remaining Customers         : ${remainingCustomersCount}  (Expected: 0) ${remainingCustomersCount === 0 ? '✅' : '❌'}`);
  console.log(` - Remaining Outlets           : ${remainingOutletsCount}  (Expected: 0) ${remainingOutletsCount === 0 ? '✅' : '❌'}`);
  console.log(` - Remaining Reviews           : ${remainingReviewsCount}  (Expected: 0) ${remainingReviewsCount === 0 ? '✅' : '❌'}`);
  console.log(` - Remaining Subscriptions     : ${remainingSubscriptionsCount}  (Expected: 0) ${remainingSubscriptionsCount === 0 ? '✅' : '❌'}`);
  console.log(` - Remaining Non-Admin Users   : ${remainingNonAdminUsersCount}  (Expected: 0) ${remainingNonAdminUsersCount === 0 ? '✅' : '❌'}`);
  console.log(` - Admin Account Intact        : ${adminAccountIntact ? 'YES ✅' : 'NO ❌'}`);
  console.log('============================================================\n');

  if (remainingCustomersCount === 0 && remainingOutletsCount === 0 && remainingReviewsCount === 0) {
    console.log('🎉 SUCCESS: Fresh start reset completed! The database starts cleanly.');
  } else {
    console.error('⚠️ WARNING: Some records remained after reset. Check logs above.');
  }
}

runReset()
  .catch((err) => {
    console.error('\n❌ RESET ENGINE FAILED WITH ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    setTimeout(() => process.exit(0), 500);
  });
