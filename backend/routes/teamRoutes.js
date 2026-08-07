/**
 * routes/teamRoutes.js
 *
 * REST APIs for Team Member Management.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb, admin } = require('../config/firebase');
const { requireQuota } = require('../middleware/permissionMiddleware');
const permissionService = require('../services/permissionService');
const logger = require('../utils/logger');
const emailBridge = require('../src/modules/email/email.integration');

router.use((req, res, next) => {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Customer context required' });
  }
  next();
});

/**
 * GET /api/team
 * Fetch all team users for the customer.
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('users')
      .where('customerId', '==', req.user.customerId)
      .get();
    
    const team = snap.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    res.status(200).json(team);
  } catch (err) {
    logger.error('[TeamRoutes] Failed to fetch team members', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

/**
 * POST /api/team/invite
 * Invite a new team member to the customer workspace.
 */
router.post('/invite', requireQuota('multi_user_access'), async (req, res) => {
  try {
    const { email, name, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email address is required.' });
    }

    const db = getDb();
    const targetRole = role || 'outlet'; // default role is outlet

    // 1. Create or fetch user in Firebase Auth via Admin SDK
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        email,
        displayName: name || email.split('@')[0],
        emailVerified: false,
      });
    } catch (createErr) {
      if (createErr.code === 'auth/email-already-exists') {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        throw createErr;
      }
    }

    // 2. Initialize or merge Firestore user profile
    const userRef = db.collection('users').doc(userRecord.uid);
    const userSnap = await userRef.get();
    
    if (userSnap.exists && userSnap.data().customerId && userSnap.data().customerId !== req.user.customerId) {
      return res.status(400).json({ error: 'User is already registered with another customer workspace.' });
    }

    await userRef.set({
      email,
      name: name || email.split('@')[0],
      role: targetRole,
      customerId: req.user.customerId,
      isSetupComplete: false,
      isVerified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // 3. Queue Invitation Email
    const customerDoc = await db.collection('customers').doc(req.user.customerId).get();
    const workspaceName = customerDoc.exists ? customerDoc.data().name : 'Workspace';

    emailBridge.queueTeamInviteEmail(email, req.user.email, workspaceName, targetRole).catch((err) => {
      logger.error('[TeamRoutes] Failed to queue invitation email:', err.message);
    });

    // 4. Increment usage counter
    await permissionService.incrementUsage(req.user.customerId, 'multi_user_access', 1);

    res.status(201).json({
      success: true,
      uid: userRecord.uid,
      email: userRecord.email,
      message: 'Invitation sent and user registered under workspace.',
    });
  } catch (err) {
    logger.error('[TeamRoutes] Failed to invite user', { error: err.message });
    res.status(500).json({ error: err.message || 'Failed to invite team member' });
  }
});

/**
 * DELETE /api/team/:uid
 * Remove a team member.
 */
router.delete('/:uid', async (req, res) => {
  try {
    const { uid } = req.params;
    const db = getDb();
    
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      return res.status(404).json({ error: 'Team member profile not found.' });
    }

    const userData = userSnap.data();
    if (userData.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied: User does not belong to your workspace.' });
    }

    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(uid);
    } catch (authErr) {
      logger.warn('[TeamRoutes] Auth user deletion notice:', authErr.message);
    }

    // Delete from Firestore
    await userRef.delete();

    // Decrement usage counter
    await permissionService.incrementUsage(req.user.customerId, 'multi_user_access', -1);

    res.status(200).json({ success: true, message: 'Team member removed successfully.' });
  } catch (err) {
    logger.error('[TeamRoutes] Failed to remove user', { error: err.message });
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

module.exports = router;
