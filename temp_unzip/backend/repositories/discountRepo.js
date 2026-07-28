/**
 * repositories/discountRepo.js
 *
 * Firestore operations for the /discounts collection.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');

const COLLECTION = 'discounts';

/**
 * Fetch all discounts.
 */
async function getAllDiscounts() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetch a single discount by code.
 */
async function getDiscountByCode(code) {
  const db = getDb();
  const snap = await db.collection(COLLECTION).where('code', '==', code).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

/**
 * Create a new discount.
 */
async function createDiscount(data) {
  const db = getDb();
  const payload = {
    ...data,
    currentUses: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(COLLECTION).add(payload);
  logger.info('[DiscountRepo] Created discount', { id: ref.id, code: data.code });
  return ref.id;
}

/**
 * Update a discount.
 */
async function updateDiscount(discountId, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(discountId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info('[DiscountRepo] Updated discount', { id: discountId });
}

/**
 * Increment discount use.
 */
async function incrementDiscountUse(discountId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(discountId).update({
    currentUses: admin.firestore.FieldValue.increment(1),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

/**
 * Delete a discount.
 */
async function deleteDiscount(discountId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(discountId).delete();
  logger.info('[DiscountRepo] Deleted discount', { id: discountId });
}

module.exports = {
  getAllDiscounts,
  getDiscountByCode,
  createDiscount,
  updateDiscount,
  incrementDiscountUse,
  deleteDiscount
};
