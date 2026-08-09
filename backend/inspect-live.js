require('dotenv').config();
const admin = require('firebase-admin');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  projectId,
});

const db = admin.firestore();

async function inspect() {
  console.log('=== USERS DOCS (non-secret fields only) ===');
  const users = await db.collection('users').get();
  for (const doc of users.docs) {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      email: d.email,
      role: d.role,
      outletId: d.outletId || '(missing)',
      customerId: d.customerId || '(missing)',
      isSetupComplete: d.isSetupComplete,
      businessName: d.businessName || '(none)',
    }));
  }

  console.log('\n=== OUTLETS COLLECTION ===');
  const outlets = await db.collection('outlets').get();
  console.log('outlet docs:', outlets.size);
  for (const doc of outlets.docs) {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      name: d.name,
      customerId: d.customerId || '(missing)',
      ownerId: d.ownerId || '(missing)',
      isActive: d.isActive,
      status: d.status || '(missing)',
      isDeleted: d.isDeleted,
      hasGoogleRefreshToken: !!d.googleRefreshToken,
      googleAccountEmail: d.googleAccountEmail || '(none)',
    }));
  }

  console.log('\n=== ONBOARDING SESSIONS ===');
  const sessions = await db.collection('onboarding_sessions').get();
  console.log('session docs:', sessions.size);
  for (const doc of sessions.docs) {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      hasRefreshToken: !!d.googleRefreshToken,
      googleAccountEmail: d.googleAccountEmail || '(none)',
      locationCount: (d.googleLocations || []).length,
      googleAccountId: d.googleAccountId || '(none)',
    }));
  }

  console.log('\n=== CUSTOMERS COLLECTION ===');
  const customers = await db.collection('customers').get();
  console.log('customer docs:', customers.size);
  for (const doc of customers.docs) {
    const d = doc.data();
    console.log(JSON.stringify({
      id: doc.id,
      name: d.name || '(none)',
      email: d.email || '(none)',
    }));
  }
}

inspect().catch((err) => console.error('ERROR:', err.message)).finally(() => process.exit(0));