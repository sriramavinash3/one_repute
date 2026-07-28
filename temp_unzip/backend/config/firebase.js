/**
 * config/firebase.js
 *
 * Initializes Firebase Admin SDK as a singleton.
 * Exports Firestore instance used across all repositories.
 */

'use strict';

const admin = require('firebase-admin');
const { firebase: fbConfig } = require('./env');
const logger = require('../utils/logger');

let _db = null;

function initFirebase() {
  if (admin.apps.length > 0) {
    // Already initialized — return existing instance
    return admin.firestore();
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: fbConfig.projectId,
        clientEmail: fbConfig.clientEmail,
        privateKey: fbConfig.privateKey,
      }),
    });

    const db = admin.firestore();

    // Use timestamps for Firestore document fields
    db.settings({ timestampsInSnapshots: true });

    logger.info('[Firebase] Admin SDK initialized successfully');
    return db;
  } catch (err) {
    logger.error('[Firebase] Failed to initialize Admin SDK', { error: err.message });
    throw err;
  }
}

function getDb() {
  if (!_db) {
    _db = initFirebase();
  }
  return _db;
}

module.exports = {
  getDb,
  admin,
};
