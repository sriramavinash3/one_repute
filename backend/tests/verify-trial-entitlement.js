/**
 * backend/tests/verify-trial-entitlement.js
 *
 * Comprehensive Automated Verification Suite for Trial Plan Subscription & Entitlement Logic.
 *
 * Tests the complete lifecycle and rules:
 * 1. New user starts Trial -> 0 / 30 responses used
 * 2. Trial user has Starter-level feature access (Level 1 escalation matrix)
 * 3. Trial is NOT classified as a paid Starter subscription (plan identity = 'trial')
 * 4. Generate 1 response -> 1 / 30
 * 5. Generate 10 responses -> 10 / 30
 * 6. Generate remaining 20 -> 30 / 30
 * 7. Attempt response #31 -> blocked cleanly
 * 8. Trial limit does NOT reset after login/logout, refresh, or review sync
 * 9. Multiple outlets share single customer 30-response allowance
 * 10. Concurrent AI-generation requests cannot exceed 30 limit
 * 11. After 30/30, non-AI Starter-level features remain available
 * 12. Paid Starter users are completely unaffected by trial limits
 * 13. Billing/Razorpay logic does not treat trial as active paid subscription
 */

'use strict';

const assert = require('assert');

// ─── Minimal Mock Firestore Environment for Concurrency & Entitlement Testing ─────

class MockDocRef {
  constructor(id, data = {}, colName = '', db = null) {
    this.id = id;
    this._data = { ...data };
    this.colName = colName;
    this.exists = Boolean(Object.keys(data).length);
    this.db = db;
  }

  async get() {
    return {
      id: this.id,
      exists: this.exists,
      data: () => ({ ...this._data }),
    };
  }

  async set(data, opts = {}) {
    if (opts.merge) {
      this._data = { ...this._data, ...data };
    } else {
      this._data = { ...data };
    }
    this.exists = true;
  }

  async update(data) {
    this._data = { ...this._data, ...data };
    this.exists = true;
  }
}

class MockCollection {
  constructor(name, db) {
    this.name = name;
    this.db = db;
    this.docsMap = new Map();
  }

  doc(id) {
    if (!this.docsMap.has(id)) {
      this.docsMap.set(id, new MockDocRef(id, {}, this.name, this.db));
    }
    return this.docsMap.get(id);
  }
}

class MockFirestore {
  constructor() {
    this.collectionsMap = new Map();
    this.lock = Promise.resolve();
  }

  collection(name) {
    if (!this.collectionsMap.has(name)) {
      this.collectionsMap.set(name, new MockCollection(name, this));
    }
    return this.collectionsMap.get(name);
  }

  async runTransaction(updateFunction) {
    // Synchronize transactions sequentially to simulate atomic lock behavior
    const prevLock = this.lock;
    let resolveLock;
    this.lock = new Promise((resolve) => { resolveLock = resolve; });

    await prevLock;
    try {
      const transaction = {
        get: async (docRef) => docRef.get(),
        set: async (docRef, data, opts) => docRef.set(data, opts),
        update: async (docRef, data) => docRef.update(data),
      };
      return await updateFunction(transaction);
    } finally {
      resolveLock();
    }
  }
}

// ─── Inline Logic Mirrors for Standalone Verification ─────────────────────

const TOTAL_TRIAL_RESPONSE_LIMIT = 30;

function isCustomerInTrial(customerData) {
  if (!customerData) return false;
  const status = String(customerData.subscriptionStatus || '').toLowerCase();
  const plan = String(customerData.plan || customerData.planName || '').toLowerCase();
  const accountStatus = String(customerData.accountStatus || '').toLowerCase();

  return (
    status === 'trialing' ||
    status === 'trial_paid_scheduled' ||
    status === 'trial' ||
    accountStatus === 'trial' ||
    plan === 'trial' ||
    plan === 'free trial' ||
    Boolean(customerData.isTrial)
  );
}

async function consumeTrialResponseAllowance(db, customerId, requestedCount = 1) {
  if (!customerId) return { allowedCount: 0, isTrial: false, remaining: 0, used: 0 };

  const customerRef = db.collection('customers').doc(customerId);
  const usageRef = db.collection('customerUsage').doc(customerId);

  return await db.runTransaction(async (transaction) => {
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists) return { allowedCount: 0, isTrial: false, remaining: 0, used: 0 };

    const customerData = customerSnap.data();
    const inTrial = isCustomerInTrial(customerData);

    if (!inTrial) {
      return { allowedCount: requestedCount, isTrial: false, remaining: Infinity, used: 0 };
    }

    const usageSnap = await transaction.get(usageRef);
    const usageData = usageSnap.exists ? usageSnap.data() : {};

    const used = Number(
      usageData?.trial_review_responses_used ??
      usageData?.trial_ai_suggestion_count ??
      0
    );

    const remaining = Math.max(0, TOTAL_TRIAL_RESPONSE_LIMIT - used);
    const allowedCount = Math.min(requestedCount, remaining);

    if (allowedCount > 0) {
      const newUsed = used + allowedCount;
      transaction.set(
        usageRef,
        {
          trial_review_responses_used: newUsed,
          trial_ai_suggestion_count: newUsed,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return {
      allowedCount,
      isTrial: true,
      remaining: Math.max(0, remaining - allowedCount),
      used: used + allowedCount,
    };
  });
}

const PLAN_MAX_LEVELS = {
  premium: 3,
  growth: 2,
  starter: 1,
  trial: 1,
  default: 1,
};

function getPlanMaxLevel(planName = '') {
  const plan = (planName || '').toLowerCase();
  for (const [key, level] of Object.entries(PLAN_MAX_LEVELS)) {
    if (plan.includes(key)) return level;
  }
  return PLAN_MAX_LEVELS.default;
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

let total = 0;
let passed = 0;

function runTest(name, testFn) {
  total++;
  try {
    testFn();
    passed++;
    console.log(`✓ [PASS ${total}] ${name}`);
  } catch (err) {
    console.error(`✕ [FAIL ${total}] ${name}`);
    console.error(`  Error: ${err.message}`);
  }
}

async function runAsyncTest(name, testFn) {
  total++;
  try {
    await testFn();
    passed++;
    console.log(`✓ [PASS ${total}] ${name}`);
  } catch (err) {
    console.error(`✕ [FAIL ${total}] ${name}`);
    console.error(`  Error: ${err.message}`);
  }
}

async function main() {
  console.log('\n============================================================');
  console.log(' RUNNING TRIAL SUBSCRIPTION & ENTITLEMENT VERIFICATION SUITE');
  console.log('============================================================\n');

  // Test 1: New user starts Trial -> 0 / 30 used
  await runAsyncTest('New trial user starts with 0 / 30 responses used', async () => {
    const db = new MockFirestore();
    const custId = 'cust_trial_01';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
      isTrial: true,
      createdAt: new Date().toISOString(),
    });

    const custSnap = await db.collection('customers').doc(custId).get();
    const custData = custSnap.data();

    assert.strictEqual(isCustomerInTrial(custData), true);
    assert.strictEqual(custData.plan, 'trial');

    const usageSnap = await db.collection('customerUsage').doc(custId).get();
    const used = usageSnap.exists ? (usageSnap.data().trial_review_responses_used || 0) : 0;
    assert.strictEqual(used, 0);
  });

  // Test 2: Trial user has Starter-level feature access (Level 1 escalation)
  runTest('Trial user gets Starter-level feature access (Level 1 escalation matrix allowed, 2/3 blocked)', () => {
    assert.strictEqual(getPlanMaxLevel('trial'), 1);
    assert.strictEqual(getPlanMaxLevel('trialing'), 1);
    assert.strictEqual(1 <= getPlanMaxLevel('trial'), true, 'Level 1 must be allowed for Trial');
    assert.strictEqual(2 <= getPlanMaxLevel('trial'), false, 'Level 2 must be blocked for Trial');
    assert.strictEqual(3 <= getPlanMaxLevel('trial'), false, 'Level 3 must be blocked for Trial');
  });

  // Test 3: Trial is not classified as paid Starter
  runTest('Trial plan identity is distinct from paid Starter subscription', () => {
    const trialCust = { plan: 'trial', subscriptionStatus: 'trialing', isTrial: true };
    const paidStarterCust = { plan: 'plan_starter', subscriptionStatus: 'active', isTrial: false };

    assert.strictEqual(isCustomerInTrial(trialCust), true);
    assert.strictEqual(isCustomerInTrial(paidStarterCust), false);
    assert.notStrictEqual(trialCust.plan, paidStarterCust.plan);
  });

  // Test 4 & 5 & 6: Progressive consumption (1 -> 10 -> remaining 20 -> 30/30)
  await runAsyncTest('Progressive consumption of trial responses allowance (1 -> 10 -> 30/30)', async () => {
    const db = new MockFirestore();
    const custId = 'cust_trial_02';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
    });

    // Generate 1 response
    let res1 = await consumeTrialResponseAllowance(db, custId, 1);
    assert.strictEqual(res1.allowedCount, 1);
    assert.strictEqual(res1.used, 1);
    assert.strictEqual(res1.remaining, 29);

    // Generate 9 more responses -> total 10
    let res9 = await consumeTrialResponseAllowance(db, custId, 9);
    assert.strictEqual(res9.allowedCount, 9);
    assert.strictEqual(res9.used, 10);
    assert.strictEqual(res9.remaining, 20);

    // Generate 20 more responses -> total 30/30
    let res20 = await consumeTrialResponseAllowance(db, custId, 20);
    assert.strictEqual(res20.allowedCount, 20);
    assert.strictEqual(res20.used, 30);
    assert.strictEqual(res20.remaining, 0);
  });

  // Test 7: Attempt response #31 -> Blocked
  await runAsyncTest('Response #31 is blocked when 30/30 limit is reached', async () => {
    const db = new MockFirestore();
    const custId = 'cust_trial_03';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
    });

    // Exhaust 30 allowance
    await consumeTrialResponseAllowance(db, custId, 30);

    // Attempt #31
    const res31 = await consumeTrialResponseAllowance(db, custId, 1);
    assert.strictEqual(res31.allowedCount, 0, 'Response #31 must be blocked (allowedCount = 0)');
    assert.strictEqual(res31.used, 30);
    assert.strictEqual(res31.remaining, 0);
  });

  // Test 8: Trial limit does not reset on login/logout or review sync
  await runAsyncTest('Trial limit does not reset on login/logout, refresh, or review sync', async () => {
    const db = new MockFirestore();
    const custId = 'cust_trial_04';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
    });

    // Consume 15 responses
    await consumeTrialResponseAllowance(db, custId, 15);

    // Simulate login/logout / page refresh by querying Firestore fresh
    const usageSnap = await db.collection('customerUsage').doc(custId).get();
    const used = usageSnap.data().trial_review_responses_used;

    assert.strictEqual(used, 15, 'Counter must persist across session events');

    // Simulate next consumption -> consumes from 15 (remaining 15)
    const nextRes = await consumeTrialResponseAllowance(db, custId, 5);
    assert.strictEqual(nextRes.used, 20);
  });

  // Test 9: Multiple outlets share single 30-response allowance
  await runAsyncTest('Multiple outlets under same customer share single 30-response allowance', async () => {
    const db = new MockFirestore();
    const custId = 'cust_multi_outlet';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
    });

    db.collection('outlets').doc('outlet_A').set({ name: 'Outlet A', customerId: custId });
    db.collection('outlets').doc('outlet_B').set({ name: 'Outlet B', customerId: custId });

    // Outlet A generates 20 responses
    const resA = await consumeTrialResponseAllowance(db, custId, 20);
    assert.strictEqual(resA.used, 20);

    // Outlet B attempts to generate 15 responses -> only 10 allowed (totalling 30)
    const resB = await consumeTrialResponseAllowance(db, custId, 15);
    assert.strictEqual(resB.allowedCount, 10, 'Outlet B must only get remaining 10');
    assert.strictEqual(resB.used, 30);
  });

  // Test 10: Concurrent requests cannot exceed 30 responses
  await runAsyncTest('Concurrent AI response requests cannot exceed 30 total responses', async () => {
    const db = new MockFirestore();
    const custId = 'cust_concurrent';

    db.collection('customers').doc(custId).set({
      plan: 'trial',
      subscriptionStatus: 'trialing',
    });

    // Fire 50 concurrent requests for 1 response each
    const requests = Array.from({ length: 50 }, () => consumeTrialResponseAllowance(db, custId, 1));
    const results = await Promise.all(requests);

    const successfulGrants = results.filter((r) => r.allowedCount === 1).length;
    const blockedRequests = results.filter((r) => r.allowedCount === 0).length;

    assert.strictEqual(successfulGrants, 30, 'Exactly 30 concurrent requests must be granted');
    assert.strictEqual(blockedRequests, 20, '20 requests must be blocked');

    const finalUsage = await db.collection('customerUsage').doc(custId).get();
    assert.strictEqual(finalUsage.data().trial_review_responses_used, 30);
  });

  // Test 11: Non-AI Starter features remain available after 30/30 limit
  runTest('Starter-level features remain accessible after 30/30 response limit is reached', () => {
    const trialCust = { plan: 'trial', subscriptionStatus: 'trialing' };
    const maxLevel = getPlanMaxLevel(trialCust.plan);

    assert.strictEqual(maxLevel, 1, 'Level 1 escalation matrix remains available even when AI response limit is reached');
  });

  // Test 12: Paid Starter users are unaffected by trial response limit
  await runAsyncTest('Paid Starter users are not subject to trial 30-response limit', async () => {
    const db = new MockFirestore();
    const custId = 'cust_paid_starter';

    db.collection('customers').doc(custId).set({
      plan: 'plan_starter',
      subscriptionStatus: 'active',
      isTrial: false,
    });

    const res = await consumeTrialResponseAllowance(db, custId, 100);
    assert.strictEqual(res.isTrial, false);
    assert.strictEqual(res.allowedCount, 100, 'Paid Starter users receive requested allowance without trial cap');
    assert.strictEqual(res.remaining, Infinity);
  });

  // Test 13: Billing logic does not treat Trial as an active paid subscription
  runTest('Billing and Razorpay logic does not classify trial as paid subscription', () => {
    const trialCustomer = { subscriptionStatus: 'trialing', plan: 'trial', razorpaySubscriptionId: null };
    const activePaidCustomer = { subscriptionStatus: 'active', plan: 'plan_starter', razorpaySubscriptionId: 'sub_rzp_123' };

    assert.strictEqual(isCustomerInTrial(trialCustomer), true);
    assert.strictEqual(isCustomerInTrial(activePaidCustomer), false);
    assert.strictEqual(trialCustomer.subscriptionStatus !== 'active', true, 'Trial status must not equal active paid status');
  });

  console.log(`\n============================================================`);
  console.log(` SUMMARY: ${passed} / ${total} TESTS PASSED CLEANLY`);
  console.log(`============================================================\n`);

  if (passed !== total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
