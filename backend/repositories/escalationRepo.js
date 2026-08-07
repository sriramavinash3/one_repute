/**
 * repositories/escalationRepo.js
 *
 * Firestore operations for the /escalationSettings and /escalationHistory collections.
 * Encrypts sensitive fields (whatsappNumber, email) at rest.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const { encrypt, decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const SETTINGS_COLLECTION = 'escalationSettings';
const HISTORY_COLLECTION = 'escalationHistory';

/**
 * Fetch settings for all levels for a specific customer.
 * Decrypts sensitive fields.
 *
 * @param {string} customerId
 * @returns {Promise<Array>}
 */
async function getSettingsByCustomerId(customerId) {
  const db = getDb();
  const snap = await db
    .collection(SETTINGS_COLLECTION)
    .where('customerId', '==', customerId)
    .get();

  const settings = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      whatsappNumber: decrypt(data.whatsappNumber),
      email: decrypt(data.email),
    };
  });

  // Sort by level ascending
  return settings.sort((a, b) => a.level - b.level);
}

/**
 * Fetch settings for a specific level.
 *
 * @param {string} customerId
 * @param {number} level
 * @returns {Promise<Object|null>}
 */
async function getSettingByCustomerAndLevel(customerId, level) {
  const db = getDb();
  const docId = `${customerId}_${level}`;
  const doc = await db.collection(SETTINGS_COLLECTION).doc(docId).get();
  if (!doc.exists) return null;

  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    whatsappNumber: decrypt(data.whatsappNumber),
    email: decrypt(data.email),
  };
}

/**
 * Create or update settings for a specific level.
 * Encrypts sensitive fields.
 *
 * @param {string} customerId
 * @param {number} level
 * @param {Object} configData
 * @returns {Promise<string>} docId
 */
async function saveSetting(customerId, level, configData) {
  const db = getDb();
  const docId = `${customerId}_${level}`;

  const payload = {
    id: docId,
    customerId,
    level: Number(level),
    name: configData.name,
    designation: configData.designation || null,
    countryCode: configData.countryCode,
    whatsappNumber: encrypt(configData.whatsappNumber),
    email: encrypt(configData.email || null),
    escalationMinutes: Number(configData.escalationMinutes),
    enabled: configData.enabled !== false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Check if document exists to add createdAt
  const ref = db.collection(SETTINGS_COLLECTION).doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
  logger.info('[EscalationRepo] Saved setting', { customerId, level });
  return docId;
}

/**
 * Delete settings for a specific level.
 *
 * @param {string} customerId
 * @param {number} level
 */
async function deleteSetting(customerId, level) {
  const db = getDb();
  const docId = `${customerId}_${level}`;
  await db.collection(SETTINGS_COLLECTION).doc(docId).delete();
  logger.info('[EscalationRepo] Deleted setting', { customerId, level });
}

/**
 * Fetch escalation history for a customer.
 * Decrypts sensitive fields.
 *
 * @param {string} customerId
 * @returns {Promise<Array>}
 */
async function getHistoryByCustomerId(customerId) {
  const db = getDb();
  const snap = await db
    .collection(HISTORY_COLLECTION)
    .where('customerId', '==', customerId)
    .get();

  const history = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      recipientWhatsApp: decrypt(data.recipientWhatsApp),
      recipientEmail: decrypt(data.recipientEmail),
    };
  });

  // Sort newest first
  return history.sort((a, b) => {
    const timeA = a.sentAt ? (a.sentAt.toDate ? a.sentAt.toDate().getTime() : new Date(a.sentAt).getTime()) : 0;
    const timeB = b.sentAt ? (b.sentAt.toDate ? b.sentAt.toDate().getTime() : new Date(b.sentAt).getTime()) : 0;
    return timeB - timeA;
  });
}

/**
 * Fetch logs for a specific review.
 *
 * @param {string} reviewId
 * @returns {Promise<Array>}
 */
async function getHistoryByReviewId(reviewId) {
  const db = getDb();
  const snap = await db
    .collection(HISTORY_COLLECTION)
    .where('reviewId', '==', reviewId)
    .get();

  const history = snap.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      recipientWhatsApp: decrypt(data.recipientWhatsApp),
      recipientEmail: decrypt(data.recipientEmail),
    };
  });

  return history.sort((a, b) => {
    const timeA = a.sentAt ? (a.sentAt.toDate ? a.sentAt.toDate().getTime() : new Date(a.sentAt).getTime()) : 0;
    const timeB = b.sentAt ? (b.sentAt.toDate ? b.sentAt.toDate().getTime() : new Date(b.sentAt).getTime()) : 0;
    return timeA - timeB;
  });
}

/**
 * Save an escalation log in history.
 *
 * @param {Object} historyData
 * @returns {Promise<string>} docId
 */
async function saveHistory(historyData) {
  const db = getDb();
  const payload = {
    reviewId: historyData.reviewId,
    customerId: historyData.customerId,
    level: Number(historyData.level),
    recipientName: historyData.recipientName,
    recipientWhatsApp: encrypt(historyData.recipientWhatsApp),
    recipientEmail: encrypt(historyData.recipientEmail || null),
    channel: historyData.channel, // 'WhatsApp' | 'Email'
    status: historyData.status || 'success',
    deliveryStatus: historyData.deliveryStatus || 'sent',
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    completedAt: admin.firestore.FieldValue.serverTimestamp(),
    errorMessage: historyData.errorMessage || null,
  };

  const ref = await db.collection(HISTORY_COLLECTION).add(payload);
  return ref.id;
}

module.exports = {
  getSettingsByCustomerId,
  getSettingByCustomerAndLevel,
  saveSetting,
  deleteSetting,
  getHistoryByCustomerId,
  getHistoryByReviewId,
  saveHistory,
};
