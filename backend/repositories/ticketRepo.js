/**
 * repositories/ticketRepo.js
 *
 * Firestore operations for the /tickets collection.
 */

'use strict';

const { getDb, admin } = require('../config/firebase');
const logger = require('../utils/logger');

const COLLECTION = 'tickets';

/**
 * Fetch all tickets.
 */
async function getAllTickets() {
  const db = getDb();
  const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Fetch tickets by customer or outlet ID.
 */
async function getTicketsByEntity(entityType, entityId) {
  const db = getDb();
  const snap = await db.collection(COLLECTION)
    .where(`${entityType}Id`, '==', entityId)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Create a new ticket.
 */
async function createTicket(data) {
  const db = getDb();
  const payload = {
    ...data,
    status: data.status || 'Open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const ref = await db.collection(COLLECTION).add(payload);
  logger.info('[TicketRepo] Created ticket', { id: ref.id, title: data.title });
  return ref.id;
}

/**
 * Update a ticket.
 */
async function updateTicket(ticketId, updates) {
  const db = getDb();
  await db.collection(COLLECTION).doc(ticketId).update({
    ...updates,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  logger.info('[TicketRepo] Updated ticket', { id: ticketId });
}

/**
 * Delete a ticket.
 */
async function deleteTicket(ticketId) {
  const db = getDb();
  await db.collection(COLLECTION).doc(ticketId).delete();
  logger.info('[TicketRepo] Deleted ticket', { id: ticketId });
}

module.exports = {
  getAllTickets,
  getTicketsByEntity,
  createTicket,
  updateTicket,
  deleteTicket
};
