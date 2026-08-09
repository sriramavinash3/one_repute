require('dotenv').config();
const admin = require('firebase-admin');
const crypto = require('crypto');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  projectId,
});

const db = admin.firestore();
const UID = 'probe-local-e2e';

function encrypt(text) {
  const key = crypto.createHash('sha256').update(process.env.ENCRYPTION_KEY || '').digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

async function seed() {
  await db.collection('onboarding_sessions').doc(UID).set({
    googleRefreshToken: encrypt('DUMMY_REFRESH_TOKEN_FOR_E2E_PROBE'),
    googleAccountId: 'probe-account-123',
    googleAccountEmail: 'probe@business.test',
    googleLocations: [{ id: 'loc_1', name: 'Probe Test Location' }],
    googleTokenScope: 'openid business.manage',
    googleTokenExpiresAt: Date.now() + 3600000,
    createdAt: new Date(),
  });
  await db.collection('users').doc(UID).set({
    email: 'probe@onerepute.test',
    role: 'outlet',
    isSetupComplete: false,
    createdAt: new Date(),
  });
  console.log('SEEDED session + user');
}

async function verify() {
  const userSnap = await db.collection('users').doc(UID).get();
  const user = userSnap.data();
  console.log('USER_DOC:', JSON.stringify({
    id: UID,
    outletId: user.outletId || '(missing)',
    customerId: user.customerId || '(missing)',
    isSetupComplete: user.isSetupComplete,
    businessName: user.businessName,
  }));

  const sessionSnap = await db.collection('onboarding_sessions').doc(UID).get();
  console.log('SESSION_DELETED:', !sessionSnap.exists);

  if (user.outletId) {
    const outletSnap = await db.collection('outlets').doc(user.outletId).get();
    const o = outletSnap.data();
    console.log('OUTLET_DOC:', JSON.stringify({
      id: user.outletId,
      name: o.name,
      customerId: o.customerId,
      ownerId: o.ownerId,
      isActive: o.isActive,
      status: o.status,
      tokenIsEncryptedCopy: o.googleRefreshToken === 'ENCRYPTED_MARKER' ? false : (o.googleRefreshToken || '').includes(':') && !o.googleRefreshToken.includes('DUMMY_REFRESH_TOKEN'),
      googleAccountEmail: o.googleAccountEmail,
      locationCount: (o.googleLocations || []).length,
    }));
    console.log('CUSTOMER_ID_RESTURN_OUTLET_ID:', o.customerId);
  }
}

async function verifyCustomer() {
  const userSnap = await db.collection('users').doc(UID).get();
  const customerId = userSnap.data().customerId;
  if (customerId) {
    const csnap = await db.collection('customers').doc(customerId).get();
    const c = csnap.data();
    console.log('CUSTOMER_DOC:', JSON.stringify({
      id: customerId,
      name: c.name,
      email: c.email,
      plan: c.plan,
      subscriptionStatus: c.subscriptionStatus,
      trialEndsAtPresent: !!c.trialEndsAt,
    }));
  }
}

async function cleanup() {
  const userSnap = await db.collection('users').doc(UID).get();
  if (userSnap.exists) {
    const outletId = userSnap.data().outletId;
    const customerId = userSnap.data().customerId;
    if (outletId) await db.collection('outlets').doc(outletId).delete();
    if (customerId) await db.collection('customers').doc(customerId).delete();
  }
  await db.collection('users').doc(UID).delete();
  await db.collection('onboarding_sessions').doc(UID).delete();
  console.log('CLEANED UP');

  const counts = {};
  for (const col of ['users', 'customers', 'outlets', 'onboarding_sessions']) {
    const snap = await db.collection(col).get();
    counts[col] = snap.size;
  }
  console.log('FINAL_COUNTS:', JSON.stringify(counts));
}

const mode = process.argv[2];
(mode === 'seed' ? seed() : mode === 'verify' ? verify() : mode === 'customer' ? verifyCustomer() : cleanup())
  .catch((err) => console.error('ERR:', err.message))
  .finally(() => process.exit(0));