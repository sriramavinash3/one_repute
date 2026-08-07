/**
 * middleware/auth.js
 * 
 * Firebase Auth token verification and RBAC middleware.
 */

'use strict';

const { admin } = require('../config/firebase');
const logger = require('../utils/logger');

const ADMIN_EMAIL = 'admin@onerepute.com';

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
    
    // Check if email matches system administrator
    const userEmail = (decodedToken.email || '').toLowerCase();
    const isAdminEmail = userEmail === ADMIN_EMAIL.toLowerCase();

    // Fetch user role from Firestore
    const db = require('../config/firebase').getDb();
    const userDoc = await db.collection('users').doc(decodedToken.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    
    let userRole = userData.role || 'GUEST';

    // Single Administrator Enforcement:
    // Only admin@onerepute.com gets admin access.
    if (isAdminEmail) {
      userRole = 'admin';
    } else if (String(userRole).toLowerCase() === 'admin' || String(userRole).toLowerCase() === 'super_admin') {
      // Demote non-admin email attempting to use admin role
      logger.warn('[AuthMiddleware] Demoting unauthorized admin role for email:', userEmail);
      userRole = 'outlet';
    }

    let customerId = userData.customerId || null;
    if (!customerId && userRole === 'outlet') {
      // Fallback 1: Query customers collection where email matches
      const customerSnap = await db.collection('customers')
        .where('email', '==', decodedToken.email)
        .limit(1)
        .get();
      if (!customerSnap.empty) {
        customerId = customerSnap.docs[0].id;
        await db.collection('users').doc(decodedToken.uid).update({ customerId });
      } else {
        // Fallback 2: Check if there's any outlet assigned
        const outletSnap = await db.collection('outlets')
          .where('ownerId', '==', decodedToken.uid)
          .limit(1)
          .get();
        if (!outletSnap.empty && outletSnap.docs[0].data().customerId) {
          customerId = outletSnap.docs[0].data().customerId;
          await db.collection('users').doc(decodedToken.uid).update({ customerId });
        }
      }
    }

    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role: userRole,
      customerId,
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

    const userRole = String(req.user.role).toLowerCase();
    const normalizedAllowed = allowedRoles.map((r) => String(r).toLowerCase());

    // Strict Admin check: Admin routes require role 'admin' AND email admin@onerepute.com
    if (normalizedAllowed.includes('admin') || normalizedAllowed.includes('super_admin')) {
      if ((req.user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        logger.warn('[AuthMiddleware] Non-admin email denied admin access', { uid: req.user.uid, email: req.user.email });
        return res.status(403).json({ error: 'Forbidden: Only admin@onerepute.com has platform administrator access' });
      }
    }

    if (!normalizedAllowed.includes(userRole) && !(userRole === 'admin' && normalizedAllowed.includes('admin'))) {
      logger.warn('[AuthMiddleware] Access denied', { uid: req.user.uid, role: req.user.role, required: allowedRoles });
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
    }

    next();
  };
};

module.exports = {
  ADMIN_EMAIL,
  verifyToken,
  requireRole
};

