require('dotenv').config();
const admin = require('firebase-admin');

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

async function inspect() {
  console.log('=== DISCOVERY & INSPECTION ===');
  
  // Auth users
  const authUsers = [];
  let pageToken;
  do {
    const res = await auth.listUsers(1000, pageToken);
    authUsers.push(...res.users);
    pageToken = res.pageToken;
  } while (pageToken);

  console.log(`\nFirebase Auth Users: ${authUsers.length}`);
  authUsers.forEach(u => console.log(` - UID: ${u.uid} | Email: ${u.email}`));

  const collections = [
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
    'plans',
    'billingPrices',
    'discounts'
  ];

  console.log('\nFirestore Collections Summary:');
  for (const col of collections) {
    const snap = await db.collection(col).get();
    console.log(` - ${col.padEnd(20)} : ${snap.size} documents`);
  }
}

inspect().catch(err => console.error(err)).finally(() => process.exit(0));
