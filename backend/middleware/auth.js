/**
 * middleware/auth.js
 * 
 * Firebase Auth token verification and RBAC middleware.
 */

'use strict';

const { admin } = require('../config/firebase');
const logger = require('../utils/logger');

/**
 * Verify Firebase ID token and inject req.user
 */
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    
    // Fetch user role from Firestore
    const db = require('../config/firebase').getDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    
    const userData = userDoc.exists ? userDoc.data() : {};
    
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userData.role || 'GUEST',
      customerId: userData.customerId || null,
      assignedOutletIds: userData.assignedOutletIds || []
    };

    next();
  } catch (err) {
    logger.warn('[AuthMiddleware] Invalid token', { error: err.message });
    res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};

/**
 * RBAC middleware generator
 * @param {Array<string>} allowedRoles 
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Forbidden: No role assigned' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('[AuthMiddleware] Access denied', { uid: req.user.uid, role: req.user.role, required: allowedRoles });
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  verifyToken,
  requireRole
};
