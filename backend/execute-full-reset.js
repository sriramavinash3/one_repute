/**
 * execute-full-reset.js
 *
 * Full Data Reset Script for OneRepute:
 *   1. Exports backup of all Firestore collections to backend/backups/
 *   2. Preserves Admin Account (admin@onerepute.com) in Auth & Firestore
 *   3. Deletes dependent records in strict dependency order:
 *      - reviews
 *      - escalationSettings
 *      - activityLogs
 *      - customerUsage
 *      - supportTickets / reports / invoices / payments / transactions
 *      - outlets
 *      - customers
 *      - non-admin users (Firestore)
 *      - non-admin users (Firebase Auth)
 *   4. Verifies database clean state
 */

require('dotenv').config();
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const ADMIN_EMAIL = 'admin@onerepute.com';

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

if (!projectId || !clientEmail || !privateKey) {
  console.error('ERROR: Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY');
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
    const res = await auth.listUsers(1000, pageToken);
    users.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);
  return users;
}

async function fetchCollectionDocs(collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function batchDeleteCollection(collectionName, filterFn = null) {
  const snap = await db.collection(collectionName).get();
  let docsToDelete = snap.docs;
  if (filterFn) {
    docsToDelete = docsToDelete.filter(filterFn);
  }
  
  let deletedCount = 0;
  const chunkSize = 400;
  for (let i = 0; i < docsToDelete.length; i += chunkSize) {
    const batch = db.batch();
    const chunk = docsToDelete.slice(i, i + chunkSize);
    chunk.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    deletedCount += chunk.length;
  }
  return deletedCount;
}

// ─── Main Execution ─────────────────────────────────────────────────────────

async function run() {
  console.log('\n============================================================');
  console.log('       ONEREPUTE FULL DATA RESET ENGINE');
  console.log('============================================================\n');

  // 1. INSPECT & PREPARE BACKUP
  console.log('STEP 1: Backing up database state to disk...');

  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const collectionsToBackup = [
    'users',
    'customers',
    'outlets',
    'reviews',
    'activityLogs',
    'customerUsage',
    'escalationSettings',
    'supportTickets',
    'reports',
    'invoices',
    'payments',
    'transactions',
    'plans'
  ];

  const backupData = {};
  for (const col of collectionsToBackup) {
    backupData[col] = await fetchCollectionDocs(col);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(backupDir, `firestore-backup-${timestamp}.json`);
  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2));

  // Verify backup
  if (!fs.existsSync(backupFilePath) || fs.statSync(backupFilePath).size === 0) {
    console.error('CRITICAL: Database backup failed or created empty file. Aborting reset!');
    process.exit(1);
  }
  console.log(`✅ Backup successfully created at:\n   ${backupFilePath} (${(fs.statSync(backupFilePath).size / 1024).toFixed(2)} KB)\n`);

  // 2. DISCOVERY COUNTS
  const authUsers = await listAllAuthUsers();
  const adminAuthUser = authUsers.find(u => (u.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase());
  const nonAdminAuthUsers = authUsers.filter(u => (u.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase());

  console.log('STEP 2: Data Audit Summary');
  console.log(` - Firebase Auth Users Total   : ${authUsers.length}`);
  console.log(` - Admin Auth User Found       : ${adminAuthUser ? `YES (${adminAuthUser.uid})` : 'NO'}`);
  console.log(` - Application Users to Delete : ${nonAdminAuthUsers.length}`);
  console.log(` - Customers to Delete         : ${backupData.customers.length}`);
  console.log(` - Outlets to Delete           : ${backupData.outlets.length}`);
  console.log(` - Reviews to Delete           : ${backupData.reviews.length}`);
  console.log(` - Activity Logs to Delete     : ${backupData.activityLogs.length}`);
  console.log(` - Customer Usage to Delete    : ${backupData.customerUsage.length}`);
  console.log(` - Escalation Settings to Del  : ${backupData.escalationSettings.length}\n`);

  // 3. EXECUTE DEPENDENCY ORDERED DELETION
  console.log('STEP 3: Executing Transactional Batch Deletions in Dependency Order...\n');

  // Step 3.1: Delete Reviews
  console.log(' -> Deleting reviews collection...');
  const reviewsDeleted = await batchDeleteCollection('reviews');
  console.log(`    Deleted ${reviewsDeleted} reviews.`);

  // Step 3.2: Delete Escalation Settings
  console.log(' -> Deleting escalationSettings collection...');
  const escalationDeleted = await batchDeleteCollection('escalationSettings');
  console.log(`    Deleted ${escalationDeleted} escalation settings.`);

  // Step 3.3: Delete Activity Logs
  console.log(' -> Deleting activityLogs collection...');
  const activityLogsDeleted = await batchDeleteCollection('activityLogs');
  console.log(`    Deleted ${activityLogsDeleted} activity logs.`);

  // Step 3.4: Delete Customer Usage
  console.log(' -> Deleting customerUsage collection...');
  const usageDeleted = await batchDeleteCollection('customerUsage');
  console.log(`    Deleted ${usageDeleted} customer usage records.`);

  // Step 3.5: Delete Support Tickets, Reports, Invoices, Payments, Transactions
  console.log(' -> Deleting auxiliary transactional collections...');
  await batchDeleteCollection('supportTickets');
  await batchDeleteCollection('reports');
  await batchDeleteCollection('invoices');
  await batchDeleteCollection('payments');
  await batchDeleteCollection('transactions');
  console.log('    Auxiliary transactional collections cleared.');

  // Step 3.6: Delete Outlets
  console.log(' -> Deleting outlets collection...');
  const outletsDeleted = await batchDeleteCollection('outlets');
  console.log(`    Deleted ${outletsDeleted} outlets.`);

  // Step 3.7: Delete Customers
  console.log(' -> Deleting customers collection...');
  const customersDeleted = await batchDeleteCollection('customers');
  console.log(`    Deleted ${customersDeleted} customers.`);

  // Step 3.8: Delete Non-Admin Firestore Users Docs
  console.log(' -> Cleaning Firestore users collection (preserving admin)...');
  const firestoreUsersDeleted = await batchDeleteCollection('users', (doc) => {
    return (doc.data().email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase();
  });
  console.log(`    Deleted ${firestoreUsersDeleted} non-admin user documents from Firestore.`);

  // Clean / preserve Admin user doc in Firestore
  if (adminAuthUser) {
    console.log(' -> Updating Admin user document in Firestore...');
    await db.collection('users').doc(adminAuthUser.uid).set({
      email: ADMIN_EMAIL,
      role: 'admin',
      isSetupComplete: true,
      customerId: null,
      outletId: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log('    Admin user doc updated & preserved.');
  }

  // Step 3.9: Delete Non-Admin Auth Users
  console.log(' -> Deleting non-admin Firebase Auth user accounts...');
  let authUsersDeleted = 0;
  for (const u of nonAdminAuthUsers) {
    try {
      await auth.deleteUser(u.uid);
      authUsersDeleted++;
    } catch (err) {
      console.error(`    Error deleting Auth user ${u.uid} (${u.email}):`, err.message);
    }
  }
  console.log(`    Deleted ${authUsersDeleted} non-admin users from Firebase Auth.`);

  // 4. FINAL VERIFICATION
  console.log('\nSTEP 4: Verifying Final Database & Auth State...\n');

  const finalAuthUsers = await listAllAuthUsers();
  const finalFirestoreUsers = await fetchCollectionDocs('users');
  const finalCustomers = await fetchCollectionDocs('customers');
  const finalOutlets = await fetchCollectionDocs('outlets');
  const finalReviews = await fetchCollectionDocs('reviews');
  const finalLogs = await fetchCollectionDocs('activityLogs');

  console.log('============================================================');
  console.log('            VERIFICATION & FINAL AUDIT');
  console.log('============================================================');
  console.log(` - Final Auth Users Total      : ${finalAuthUsers.length} (Expected: 1)`);
  console.log(` - Admin Auth User Intact      : ${finalAuthUsers.some(u => u.email === ADMIN_EMAIL) ? 'YES ✅' : 'NO ❌'}`);
  console.log(` - Final Firestore Users       : ${finalFirestoreUsers.length} (Expected: 1)`);
  console.log(` - Final Customers             : ${finalCustomers.length} (Expected: 0)`);
  console.log(` - Final Outlets               : ${finalOutlets.length} (Expected: 0)`);
  console.log(` - Final Reviews               : ${finalReviews.length} (Expected: 0)`);
  console.log(` - Final Activity Logs         : ${finalLogs.length} (Expected: 0)`);
  console.log('============================================================\n');

  console.log('Full reset completed successfully!');
}

run().catch(err => {
  console.error('\nRESET FAILED WITH ERROR:', err);
  process.exit(1);
}).finally(() => {
  setTimeout(() => process.exit(0), 500);
});
