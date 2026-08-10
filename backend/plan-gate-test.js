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
const BASE = 'https://onerepute.com';

const USERS = {
  starter: { uid: 'probe-p1-uid', cust: 'probe-p1-cust', outlet: 'probe-p1-outlet', plan: 'plan_starter', email: 'probe.p1@esc.test' },
  growth: { uid: 'probe-p2-uid', cust: 'probe-p2-cust', outlet: 'probe-p2-outlet', plan: 'plan_growth', email: 'probe.p2@esc.test' },
  premium: { uid: 'probe-p3-uid', cust: 'probe-p3-cust', outlet: 'probe-p3-outlet', plan: 'plan_premium', email: 'probe.p3@esc.test' },
};

async function seed() {
  const now = new Date();
  for (const key of Object.keys(USERS)) {
    const u = USERS[key];
    await db.collection('customers').doc(u.cust).set({ name: 'Probe ' + key, email: u.email, plan: u.plan, subscriptionStatus: 'active', createdAt: now });
    await db.collection('outlets').doc(u.outlet).set({ name: 'Probe Outlet ' + key, customerId: u.cust, ownerId: u.uid, isActive: true, status: 'active', createdAt: now, updatedAt: now });
    await db.collection('users').doc(u.uid).set({ email: u.email, role: 'outlet', customerId: u.cust, outletId: u.outlet, isSetupComplete: true, createdAt: now });
  }
  console.log('SEEDED 3 plan users');
}

async function getIdToken(uid) {
  const customToken = await admin.auth().createCustomToken(uid);
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
  for (const key of Object.keys(USERS)) {
    const u = USERS[key];
    await db.collection('users').doc(u.uid).delete().catch(() => {});
    await db.collection('customers').doc(u.cust).delete().catch(() => {});
    await db.collection('outlets').doc(u.outlet).delete().catch(() => {});
    await db.collection('escalationSettings').doc(u.outlet).delete().catch(() => {});
    await admin.auth().deleteUser(u.uid).catch(() => {});
  }
  const counts = {};
  for (const col of ['users', 'customers', 'outlets', 'escalationSettings']) {
    counts[col] = (await db.collection(col).get()).size;
  }
  console.log('CLEANED UP. counts:', JSON.stringify(counts));
}

const mode = process.argv[2];
(mode === 'seed' ? seed() : mode === 'token' ? getIdToken(process.argv[3]).then((t) => console.log(t)) : cleanup())
  .catch((err) => console.error('ERR:', err.message))
  .finally(() => process.exit(0));