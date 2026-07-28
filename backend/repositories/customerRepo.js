/**
 * repositories/customerRepo.js
 *
 * Firestore operations for the /customers collection.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');

const COLLECTION = 'customers';

/**
 * Fetch all customers.
 */
async function getAllCustomers() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetch a single customer by ID.
 */
async function getCustomerById(customerId) {
  const db = getDb();
  const doc = await db.collection(COLLECTION).doc(customerId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

/**
 * Create a new customer.
 */
async function createCustomer(data) {
  const db = getDb();
  const payload = {
    ...data,
    accountStatus: data.accountStatus || 'Active', // Active / Inactive / Trial
    paymentStatus: data.paymentStatus || 'Pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(COLLECTION).add(payload);
  logger.info('[CustomerRepo] Created customer', { id: ref.id, name: data.name });
  return ref.id;
}

/**
 * Update an existing customer.
 */
async function updateCustomer(customerId, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(customerId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info('[CustomerRepo] Updated customer', { id: customerId });
}

/**
 * Delete a customer.
 */
async function deleteCustomer(customerId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(customerId).delete();
  logger.info('[CustomerRepo] Deleted customer', { id: customerId });
}

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer
};
