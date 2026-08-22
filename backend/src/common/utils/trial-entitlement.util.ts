import * as admin from 'firebase-admin';

export const TOTAL_TRIAL_RESPONSE_LIMIT = 30;

export interface TrialAllowanceResult {
  allowedCount: number;
  isTrial: boolean;
  remaining: number;
  used: number;
}

/**
 * Determines whether a customer record is currently in trial status.
 */
export function isCustomerInTrial(customerData: any): boolean {
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

/**
 * Atomically consumes up to `requestedCount` trial AI review responses for a customer.
 * Uses a Firestore transaction to prevent race conditions across concurrent requests.
 */
export async function consumeTrialResponseAllowance(
  db: admin.firestore.Firestore,
  customerId: string,
  requestedCount: number = 1
): Promise<TrialAllowanceResult> {
  if (!customerId || !db) {
    return { allowedCount: 0, isTrial: false, remaining: 0, used: 0 };
  }

  const customerRef = db.collection('customers').doc(customerId);
  const usageRef = db.collection('customerUsage').doc(customerId);

  if (typeof db.runTransaction !== 'function') {
    const customerSnap = await customerRef.get();
    if (!customerSnap.exists) {
      return { allowedCount: 0, isTrial: false, remaining: 0, used: 0 };
    }

    const customerData = customerSnap.data();
    const inTrial = isCustomerInTrial(customerData);

    if (!inTrial) {
      return { allowedCount: requestedCount, isTrial: false, remaining: Infinity, used: 0 };
    }

    const usageSnap = await usageRef.get();
    const usageData = usageSnap.exists ? usageSnap.data() : {};

    const used = Number(
      usageData?.trial_review_responses_used ??
      usageData?.trial_ai_suggestion_count ??
      usageData?.trial_auto_reply_count ??
      0
    );

    const remaining = Math.max(0, TOTAL_TRIAL_RESPONSE_LIMIT - used);
    const allowedCount = Math.min(requestedCount, remaining);

    if (allowedCount > 0) {
      const newUsed = used + allowedCount;
      await usageRef.set(
        {
          trial_review_responses_used: newUsed,
          trial_ai_suggestion_count: newUsed,
          updatedAt: admin.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
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
  }

  return await db.runTransaction(async (transaction) => {
    const customerSnap = await transaction.get(customerRef);
    if (!customerSnap.exists) {
      return { allowedCount: 0, isTrial: false, remaining: 0, used: 0 };
    }

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
      usageData?.trial_auto_reply_count ??
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
          updatedAt: admin.firestore?.FieldValue?.serverTimestamp ? admin.firestore.FieldValue.serverTimestamp() : new Date(),
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

/**
 * Atomically releases/refunds `countToRelease` trial AI review responses
 * in case an upstream AI service call fails after initial reservation.
 */
export async function releaseTrialResponseAllowance(
  db: admin.firestore.Firestore,
  customerId: string,
  countToRelease: number = 1
): Promise<void> {
  if (!customerId || countToRelease <= 0) return;

  const customerRef = db.collection('customers').doc(customerId);
  const usageRef = db.collection('customerUsage').doc(customerId);

  try {
    await db.runTransaction(async (transaction) => {
      const customerSnap = await transaction.get(customerRef);
      if (!customerSnap.exists || !isCustomerInTrial(customerSnap.data())) {
        return;
      }

      const usageSnap = await transaction.get(usageRef);
      if (!usageSnap.exists) return;

      const usageData = usageSnap.data();
      const currentUsed = Number(
        usageData?.trial_review_responses_used ??
        usageData?.trial_ai_suggestion_count ??
        0
      );

      const newUsed = Math.max(0, currentUsed - countToRelease);
      transaction.set(
        usageRef,
        {
          trial_review_responses_used: newUsed,
          trial_ai_suggestion_count: newUsed,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
  } catch (err: any) {
    // Non-fatal logging for release attempt
    console.error(`[TrialEntitlement] Failed to release trial allowance for ${customerId}: ${err?.message}`);
  }
}
