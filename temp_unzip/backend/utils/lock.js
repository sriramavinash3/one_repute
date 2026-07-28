/**
 * utils/lock.js
 *
 * Simple in-process lock to prevent overlapping cron executions.
 * If a cron job is still running when the next tick fires, the new
 * tick is skipped rather than running concurrently.
 *
 * For multi-instance deployments, replace this with a Firestore
 * distributed lock (see distributedLock below).
 */

'use strict';

const logger = require('./logger');
const { getDb } = require('../config/firebase');
const env = require('../config/env');

// ─── In-process lock (single instance) ───────────────────────────────────────

const _locks = new Map();

function acquireLock(key) {
  if (_locks.get(key)) return false;
  _locks.set(key, true);
  return true;
}

function releaseLock(key) {
  _locks.delete(key);
}

// ─── Firestore distributed lock (multi-instance) ─────────────────────────────
// Use this variant if you run multiple Node.js processes/pods.

const LOCK_COLLECTION = 'cron_locks';

/**
 * Attempt to acquire a Firestore-backed distributed lock.
 * Returns true if acquired, false if already locked by another instance.
 *
 * @param {string} key         - Lock identifier (e.g. "reviewCron")
 * @param {number} ttlMs       - Lock TTL in milliseconds
 * @returns {Promise<boolean>}
 */
async function acquireDistributedLock(key, ttlMs = env.cron.lockTtlMs) {
  const db = getDb();
  const ref = db.collection(LOCK_COLLECTION).doc(key);

  try {
    let acquired = false;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();

      if (snap.exists) {
        const { lockedAt, ttl } = snap.data();
        // Stale lock — previous job crashed without releasing
        if (now < lockedAt + ttl) {
          // Lock is still valid — do NOT acquire
          return;
        }
      }

      // Lock is absent or expired — claim it
      tx.set(ref, { lockedAt: now, ttl: ttlMs, lockedBy: process.pid });
      acquired = true;
    });

    return acquired;
  } catch (err) {
    logger.error('[Lock] Failed to acquire distributed lock', { key, error: err.message });
    return false;
  }
}

/**
 * Release a Firestore-backed distributed lock.
 *
 * @param {string} key
 * @returns {Promise<void>}
 */
async function releaseDistributedLock(key) {
  const db = getDb();
  try {
    await db.collection(LOCK_COLLECTION).doc(key).delete();
  } catch (err) {
    logger.error('[Lock] Failed to release distributed lock', { key, error: err.message });
  }
}

module.exports = {
  // Single-instance
  acquireLock,
  releaseLock,
  // Multi-instance (Firestore-backed)
  acquireDistributedLock,
  releaseDistributedLock,
};
