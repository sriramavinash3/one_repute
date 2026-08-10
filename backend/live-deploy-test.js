require('dotenv').config();
const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  }),
  projectId: process.env.FIREBASE_PROJECT_ID,
});

const db = admin.firestore();
const API_KEY = 'AIzaSyCTcvYpgmvuOUy4CD-kqNLcjiAKP6giUBo';

const UID = 'probe-deploy-esc-uid';
const CUST = 'probe-deploy-esc-cust';
const OUTLET = 'probe-deploy-esc-outlet';

async function seed() {
  const now = new Date();
  await db.collection('customers').doc(CUST).set({ name: 'Probe Deploy Esc', email: 'probe.deploy@esc.test', plan: 'plan_premium', subscriptionStatus: 'active', createdAt: now });
  await db.collection('outlets').doc(OUTLET).set({ name: 'Probe Deploy Esc Outlet', customerId: CUST, ownerId: UID, isActive: true, status: 'active', createdAt: now, updatedAt: now });
  await db.collection('users').doc(UID).set({ email: 'probe.deploy@esc.test', role: 'outlet', customerId: CUST, outletId: OUTLET, isSetupComplete: true, createdAt: now });
  await admin.auth().createCustomToken(UID);
  console.log('SEEDED');
}

async function getIdToken() {
  const customToken = await admin.auth().createCustomToken(UID);
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!data.idToken) throw new Error('No idToken: ' + JSON.stringify(data));
  return data.idToken;
}

async function cleanup() {
  await db.collection('users').doc(UID).delete().catch(() => {});
  await db.collection('customers').doc(CUST).delete().catch(() => {});
  await db.collection('outlets').doc(OUTLET).delete().catch(() => {});
  await db.collection('escalationSettings').doc(OUTLET).delete().catch(() => {});
  await admin.auth().deleteUser(UID).catch(() => {});
  const counts = {};
  for (const col of ['users', 'customers', 'outlets', 'escalationSettings']) {
    counts[col] = (await db.collection(col).get()).size;
  }
  console.log('CLEANED UP. counts:', JSON.stringify(counts));
}

const mode = process.argv[2];
(mode === 'seed' ? seed() : mode === 'token' ? getIdToken().then((t) => console.log(t)) : cleanup())
  .catch((err) => console.error('ERR:', err.message))
  .finally(() => process.exit(0));