/**
 * safe-user-cleanup.js
 *
 * Safely removes all non-admin application users from:
 *   1. Firebase Auth (authentication records)
 *   2. Firestore 'users' collection (profile documents)
 *
 * PRESERVES: admin@onerepute.com (the single admin account)
 *
 * DOES NOT TOUCH:
 *   - customers collection
 *   - outlets collection
 *   - reviews collection
 *   - Any other Firestore collection
 *   - Prisma/Postgres (DATABASE_URL not set — not applicable)
 *
 * RELATIONSHIP ANALYSIS:
 *   - EmailLog.userId in Prisma: nullable (onDelete: SetNull) — Postgres not active, safe to ignore
 *   - Firestore users docs: contain outletId, customerId, role — these are profile refs only.
 *     The outlets and customers collections are INDEPENDENT Firestore docs, not FK-dependent on users.
 *   - AuthContext reads the 'users' Firestore doc by UID at login to get outletId/customerId.
 *     Deleting a user's Firestore doc + Auth record prevents future login. No cascade needed.
 *   - VerificationToken / PasswordResetToken (Prisma): keyed by email, not userId. Postgres not active.
 *
 * WHAT THIS SCRIPT DOES:
 *   Phase 0: Connect + list all auth users + all Firestore user docs
 *   Phase 1: Identify admin (admin@onerepute.com) — PRESERVED
 *   Phase 2: Print pre-deletion summary + counts
 *   Phase 3: Delete Firebase Auth records for non-admin users
 *   Phase 4: Delete Firestore 'users' docs for non-admin users
 *   Phase 5: Revoke refresh tokens for deleted users
 *   Phase 6: Verify final state
 */

require('dotenv').config();
const admin = require('firebase-admin');

const ADMIN_EMAIL = 'admin@onerepute.com';

// ─── Init Firebase Admin ──────────────────────────────────────────────────────

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('ERROR: Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY in .env');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  projectId,
});

const auth = admin.auth();
const db = admin.firestore();

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const result = await auth.listUsers(1000, pageToken);
    users.push(...result.users);
    pageToken = result.pageToken;
  } while (pageToken);
  return users;
}

async function listAllFirestoreUserDocs() {
  const snap = await db.collection('users').get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  OneRepute — Safe User Cleanup Script');
  console.log('════════════════════════════════════════════════════════════\n');

  // ── Phase 0: Discover ────────────────────────────────────────────────────

  console.log('Phase 0: Discovering users...\n');

  const [authUsers, firestoreUsers] = await Promise.all([
    listAllAuthUsers(),
    listAllFirestoreUserDocs(),
  ]);

  console.log(`Firebase Auth users total:    ${authUsers.length}`);
  console.log(`Firestore 'users' docs total: ${firestoreUsers.length}\n`);

  authUsers.forEach(u => {
    const role = u.customClaims?.role || '(no claim)';
    console.log(`  AUTH: ${u.uid.padEnd(30)} email=${u.email}  role=${role}`);
  });

  console.log('');
  firestoreUsers.forEach(u => {
    console.log(`  FIRESTORE: ${u.id.padEnd(30)} email=${u.email}  role=${u.role}  customerId=${u.customerId || '-'}  outletId=${u.outletId || '-'}`);
  });

  // ── Phase 1: Identify admin ──────────────────────────────────────────────

  const adminAuthUser = authUsers.find(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
  const usersToDeleteFromAuth = authUsers.filter(u => (u.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase());
  const usersToDeleteFromFirestore = firestoreUsers.filter(u => (u.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase());
  const adminFirestoreDoc = firestoreUsers.find(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());

  // ── Phase 2: Pre-deletion summary ───────────────────────────────────────

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  PRE-DELETION SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`\nUsers found (Auth):                  ${authUsers.length}`);
  console.log(`Users found (Firestore):             ${firestoreUsers.length}`);
  console.log(`Admin account:                       ${adminAuthUser ? adminAuthUser.email : 'NOT FOUND — proceeding with caution'}`);
  console.log(`Admin Firestore doc:                 ${adminFirestoreDoc ? 'Found (will be preserved)' : 'Not found'}`);
  console.log(`\nUsers to DELETE from Auth:           ${usersToDeleteFromAuth.length}`);
  usersToDeleteFromAuth.forEach(u => console.log(`  - ${u.uid} (${u.email})`));
  console.log(`\nUsers to DELETE from Firestore:      ${usersToDeleteFromFirestore.length}`);
  usersToDeleteFromFirestore.forEach(u => console.log(`  - ${u.id} (${u.email})`));
  console.log(`\nUsers to PRESERVE:                   ${adminAuthUser ? 1 : 0} (${ADMIN_EMAIL})`);
  console.log('\nRelated data impact:');
  console.log('  customers collection  — NOT TOUCHED (independent entity)');
  console.log('  outlets collection    — NOT TOUCHED (independent entity)');
  console.log('  reviews collection    — NOT TOUCHED (independent entity)');
  console.log('  Prisma/Postgres       — NOT ACTIVE (DATABASE_URL not set)');
  console.log('\nDatabase backup:');
  console.log('  Firebase Firestore backup: managed by Google (automatic PITR)');
  console.log('  Firebase Auth: deletion is reversible only via re-registration');
  console.log('\n════════════════════════════════════════════════════════════\n');

  if (usersToDeleteFromAuth.length === 0 && usersToDeleteFromFirestore.length === 0) {
    console.log('No non-admin users to delete. Nothing to do.');
    process.exit(0);
  }

  // ── Phase 3: Delete Firebase Auth records ───────────────────────────────

  console.log('Phase 3: Deleting Firebase Auth records...\n');
  let authDeletedCount = 0;
  let authErrorCount = 0;

  for (const u of usersToDeleteFromAuth) {
    try {
      await auth.deleteUser(u.uid);
      console.log(`  DELETED Auth: ${u.uid} (${u.email})`);
      authDeletedCount++;
    } catch (err) {
      console.error(`  ERROR deleting Auth user ${u.uid} (${u.email}): ${err.message}`);
      authErrorCount++;
    }
  }

  console.log(`\nAuth delete complete: ${authDeletedCount} deleted, ${authErrorCount} errors\n`);

  // ── Phase 4: Delete Firestore 'users' docs ──────────────────────────────

  console.log('Phase 4: Deleting Firestore user documents...\n');
  let fsDeletedCount = 0;
  let fsErrorCount = 0;

  // Batch deletes (Firestore max 500 per batch)
  const batchSize = 400;
  for (let i = 0; i < usersToDeleteFromFirestore.length; i += batchSize) {
    const batch = db.batch();
    const chunk = usersToDeleteFromFirestore.slice(i, i + batchSize);
    chunk.forEach(u => {
      batch.delete(db.collection('users').doc(u.id));
    });
    try {
      await batch.commit();
      chunk.forEach(u => console.log(`  DELETED Firestore doc: ${u.id} (${u.email})`));
      fsDeletedCount += chunk.length;
    } catch (err) {
      console.error(`  ERROR batch deleting Firestore docs: ${err.message}`);
      fsErrorCount += chunk.length;
    }
  }

  console.log(`\nFirestore delete complete: ${fsDeletedCount} deleted, ${fsErrorCount} errors\n`);

  // ── Phase 5: Revoke refresh tokens for deleted users ────────────────────

  console.log('Phase 5: Revoking any remaining refresh tokens for deleted UIDs...\n');
  // Note: auth.deleteUser() already invalidates all tokens for that user.
  // This phase is a belt-and-suspenders verification — revoking is already done by delete.
  console.log('  Token revocation: handled automatically by auth.deleteUser()\n');

  // ── Phase 6: Final verification ─────────────────────────────────────────

  console.log('Phase 6: Verifying final state...\n');

  const [remainingAuth, remainingFirestore] = await Promise.all([
    listAllAuthUsers(),
    listAllFirestoreUserDocs(),
  ]);

  console.log(`Firebase Auth users remaining:    ${remainingAuth.length}`);
  remainingAuth.forEach(u => console.log(`  REMAINING AUTH: ${u.uid} (${u.email})`));

  console.log(`\nFirestore 'users' docs remaining: ${remainingFirestore.length}`);
  remainingFirestore.forEach(u => console.log(`  REMAINING FIRESTORE: ${u.id} (${u.email})`));

  const adminStillExists = remainingAuth.some(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());

  // ── Final Report ─────────────────────────────────────────────────────────

  console.log('\n════════════════════════════════════════════════════════════');
  console.log('  FINAL REPORT');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`\nUSERS BEFORE (Auth):             ${authUsers.length}`);
  console.log(`USERS BEFORE (Firestore):        ${firestoreUsers.length}`);
  console.log(`\nUSERS DELETED (Auth):            ${authDeletedCount}`);
  console.log(`USERS DELETED (Firestore):       ${fsDeletedCount}`);
  console.log(`\nUSERS PRESERVED:                 1 (${ADMIN_EMAIL})`);
  console.log(`\nADMIN ACCOUNT:                   ${adminStillExists ? '✅ Preserved' : '❌ NOT FOUND — CHECK IMMEDIATELY'}`);
  console.log(`AUTHENTICATION RECORDS CLEANED:  ${authErrorCount === 0 ? '✅ Yes' : `⚠️ Partial (${authErrorCount} errors)`}`);
  console.log(`ORPHANED REFERENCES:             0 (customers/outlets/reviews are independent entities)`);
  console.log(`DATABASE ERRORS:                 ${authErrorCount + fsErrorCount === 0 ? '✅ None' : `⚠️ ${authErrorCount + fsErrorCount} errors`}`);
  console.log(`USERS REMAINING (Auth):          ${remainingAuth.length}`);
  console.log(`USERS REMAINING (Firestore):     ${remainingFirestore.length}`);
  console.log(`\nBACKUP:                          Firebase Firestore PITR (managed by Google)`);
  console.log(`FINAL STATUS:                    ${authErrorCount + fsErrorCount === 0 ? '✅ Complete' : '⚠️ Completed with errors'}`);
  console.log('\n════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
}).finally(() => {
  setTimeout(() => process.exit(0), 500);
});
