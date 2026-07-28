/**
 * repositories/outletRepo.js
 *
 * All Firestore operations for the /outlets collection.
 * Services never access Firestore directly — always through repos.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/crypto');

const COLLECTION = 'outlets';

/**
 * Firestore schema updates for tenants, connections, and logs.
 */

const COLLECTIONS = {
  tenants: 'tenants',
  googleConnections: 'googleConnections',
  outlets: 'outlets',
  reviews: 'reviews',
  activityLogs: 'activityLogs',
  syncLogs: 'syncLogs',
  quotaLogs: 'quotaLogs',
  onboardingSessions: 'onboardingSessions',
};

/**
 * Fetch all active outlets that should be processed.
 * @returns {Promise<Array<{ id: string, ...data }>>}
 */
async function getActiveOutlets() {
  const db = getDb();
  const snap = await db
    .collection(COLLECTION)
    .where('isActive', '==', true)
    .get();

  return snap.docs.map((doc) => {
    const data = doc.data();
    if (data.googleRefreshToken) {
      data.googleRefreshToken = decrypt(data.googleRefreshToken);
    }
    return { id: doc.id, ...data };
  });
}

/**
 * Fetch all outlets (for admin).
 * @returns {Promise<Array>}
 */
async function getAllOutlets() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map((doc) => {
    const data = doc.data();
    if (data.googleRefreshToken) {
      data.googleRefreshToken = decrypt(data.googleRefreshToken);
    }
    return { id: doc.id, ...data };
  });
}

/**
 * Fetch a single outlet by ID.
 * @param {string} outletId
 * @returns {Promise<{ id: string, ...data }|null>}
 */
async function getOutletById(outletId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(outletId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.googleRefreshToken) {
    data.googleRefreshToken = decrypt(data.googleRefreshToken);
  }
  return { id: doc.id, ...data };
}

/**
 * Update Google connection data for an outlet.
 * @param {string} outletId
 * @param {Object} payload
 */
async function updateGoogleConnection(outletId, payload) {
  const db = getDb();
  const updates = { ...payload };

  if (updates.googleRefreshToken) {
    updates.googleRefreshToken = encrypt(updates.googleRefreshToken);
  }

  await db.collection(COLLECTION).doc(outletId).update({
    ...updates,
    googleConnectedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Update active Google location for an outlet.
 * @param {string} outletId
 * @param {string} locationId
 * @param {string} locationName
 */
async function setActiveGoogleLocation(outletId, locationId, locationName) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    googleLocationId: locationId,
    googleLocationName: locationName,
    googleLocationUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Update the Google OAuth refresh token for an outlet (rotated by Google).
 * @param {string} outletId
 * @param {string} refreshToken
 */
async function updateRefreshToken(outletId, refreshToken) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    googleRefreshToken: encrypt(refreshToken),
    tokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Create a new outlet document.
 * @param {Object} data
 * @returns {Promise<string>} - document ID
 */
async function createOutlet(data) {
  const db = getDb();
  const ref = await db.collection(COLLECTION).add({
    ...data,
    isActive: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info('[OutletRepo] Created outlet', { id: ref.id, name: data.name });
  return ref.id;
}

/**
 * Deactivate an outlet (soft delete).
 * @param {string} outletId
 */
async function deactivateOutlet(outletId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    isActive: false,
    deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Toggle outlet active status.
 * @param {string} outletId
 * @param {boolean} isActive
 */
async function toggleOutletStatus(outletId, isActive) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    isActive,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info(`[OutletRepo] Outlet ${outletId} status set to ${isActive}`);
}

/**
 * Update review sync state for an outlet.
 *
 * @param {string} outletId
 * @param {Object} updates
 */
async function updateReviewSyncState(outletId, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Cache Google account and location data for an outlet.
 * @param {string} outletId
 * @param {Object} data - { googleAccountId, locations }
 */
async function cacheGoogleBusinessData(outletId, data) {
  const db = getDb();
  await db.collection(COLLECTION).doc(outletId).update({
    googleAccountId: data.googleAccountId,
    googleLocations: data.locations,
    googleBusinessDataCachedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get cached Google business data for an outlet.
 * @param {string} outletId
 * @returns {Promise<{ googleAccountId: string, locations: Array }|null>}
 */
async function getCachedGoogleBusinessData(outletId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(outletId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  return {
    googleAccountId: data.googleAccountId || null,
    locations: data.googleLocations || [],
  };
}

/**
 * Log activity in Firestore.
 * @param {string} type - Type of activity (e.g., 'SYNC', 'QUOTA_ERROR').
 * @param {Object} payload - Additional data to log.
 */
async function logActivity(type, payload) {
  const db = getDb();
  await db.collection(COLLECTIONS.activityLogs).add({
    type,
    payload,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Log quota-related events in Firestore.
 * @param {Object} payload - Quota event details.
 */
async function logQuotaEvent(payload) {
  const db = getDb();
  await db.collection(COLLECTIONS.quotaLogs).add({
    ...payload,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Save an onboarding session containing Google tokens and locations.
 * @param {string} uid User ID
 * @param {Object} data Session data
 */
async function saveOnboardingSession(uid, data) {
  const db = getDb();
  
  if (data.googleRefreshToken) {
    data.googleRefreshToken = encrypt(data.googleRefreshToken);
  }

  await db.collection(COLLECTIONS.onboardingSessions).doc(uid).set({
    ...data,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Get an onboarding session.
 * @param {string} uid User ID
 * @returns {Promise<Object|null>}
 */
async function getOnboardingSession(uid) {
  const db = getDb();
  const doc = await db.collection(COLLECTIONS.onboardingSessions).doc(uid).get();
  if (!doc.exists) return null;
  const data = doc.data();
  if (data.googleRefreshToken) {
    data.googleRefreshToken = decrypt(data.googleRefreshToken);
  }
  return data;
}

/**
 * Delete an onboarding session.
 * @param {string} uid User ID
 */
async function deleteOnboardingSession(uid) {
  const db = getDb();
  await db.collection(COLLECTIONS.onboardingSessions).doc(uid).delete();
}

module.exports = {
  getActiveOutlets,
  getOutletById,
  updateRefreshToken,
  updateGoogleConnection,
  setActiveGoogleLocation,
  createOutlet,
  deactivateOutlet,
  cacheGoogleBusinessData,
  getAllOutlets,
  toggleOutletStatus,
  updateReviewSyncState,
  saveOnboardingSession,
  getOnboardingSession,
  deleteOnboardingSession,
  COLLECTIONS,
  logActivity,
  logQuotaEvent,
};
