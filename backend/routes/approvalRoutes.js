/**
 * routes/approvalRoutes.js
 *
 * REST APIs for Reply Approval Workflow.
 */

'use strict';

const express = require('express');
const router = express.Router();
const { getDb, admin } = require('../config/firebase');
const { requireFeature } = require('../middleware/permissionMiddleware');
const logger = require('../utils/logger');

router.use((req, res, next) => {
  if (!req.user || !req.user.customerId) {
    return res.status(403).json({ error: 'Customer context required' });
  }
  next();
});

/**
 * GET /api/approvals
 * Fetch all reviews awaiting response approval.
 */
router.get('/', requireFeature('reply_approval_mode'), async (req, res) => {
  try {
    const db = getDb();
    const snap = await db.collection('reviews')
      .where('customerId', '==', req.user.customerId)
      .where('status', '==', 'suggested')
      .get();
    
    const approvals = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(approvals);
  } catch (err) {
    logger.error('[ApprovalRoutes] Failed to fetch approvals', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch approvals' });
  }
});

/**
 * POST /api/approvals/:reviewId/approve
 * Approve the suggested AI response and mark review as responded.
 */
router.post('/:reviewId/approve', requireFeature('reply_approval_mode'), async (req, res) => {
  try {
    const { reviewId } = req.params;
    const db = getDb();
    
    const docRef = db.collection('reviews').doc(reviewId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const data = snap.data();
    if (data.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const finalResponse = data.replySuggestion || data.aiResponse;
    if (!finalResponse) {
      return res.status(400).json({ error: 'No suggested response exists to approve.' });
    }

    // Set status to responded, lock suggestion, write audit log
    await docRef.update({
      status: 'responded',
      aiResponse: finalResponse,
      repliedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalStatus: 'approved',
      approvedBy: req.user.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Write audit log
    await db.collection('activityLogs').add({
      type: 'REPLY_APPROVED',
      payload: { reviewId, customerId: req.user.customerId, approvedBy: req.user.email },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, message: 'Response approved and posted successfully.' });
  } catch (err) {
    logger.error('[ApprovalRoutes] Approval failed', { error: err.message });
    res.status(500).json({ error: 'Failed to approve response' });
  }
});

/**
 * POST /api/approvals/:reviewId/reject
 * Reject the suggested AI response.
 */
router.post('/:reviewId/reject', requireFeature('reply_approval_mode'), async (req, res) => {
  try {
    const { reviewId } = req.params;
    const db = getDb();
    
    const docRef = db.collection('reviews').doc(reviewId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const data = snap.data();
    if (data.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Clear suggestion, reset status, audit log
    await docRef.update({
      status: 'pending',
      replySuggestion: null,
      aiResponse: null,
      approvalStatus: 'rejected',
      rejectedBy: req.user.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      type: 'REPLY_REJECTED',
      payload: { reviewId, customerId: req.user.customerId, rejectedBy: req.user.email },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, message: 'Response suggestion rejected.' });
  } catch (err) {
    logger.error('[ApprovalRoutes] Rejection failed', { error: err.message });
    res.status(500).json({ error: 'Failed to reject suggestion' });
  }
});

/**
 * POST /api/approvals/:reviewId/edit
 * Edit the suggested AI response and approve immediately.
 */
router.post('/:reviewId/edit', requireFeature('reply_approval_mode'), async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { editedReply } = req.body;
    
    if (!editedReply || editedReply.trim().length === 0) {
      return res.status(400).json({ error: 'Reply text cannot be empty.' });
    }

    const db = getDb();
    const docRef = db.collection('reviews').doc(reviewId);
    const snap = await docRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: 'Review not found' });
    }

    const data = snap.data();
    if (data.customerId !== req.user.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await docRef.update({
      status: 'responded',
      aiResponse: editedReply,
      replySuggestion: editedReply,
      repliedAt: admin.firestore.FieldValue.serverTimestamp(),
      approvalStatus: 'edited_and_approved',
      approvedBy: req.user.email,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await db.collection('activityLogs').add({
      type: 'REPLY_EDITED_AND_APPROVED',
      payload: { reviewId, customerId: req.user.customerId, approvedBy: req.user.email },
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.status(200).json({ success: true, message: 'Edited response approved and posted.' });
  } catch (err) {
    logger.error('[ApprovalRoutes] Edit and approval failed', { error: err.message });
    res.status(500).json({ error: 'Failed to save edited reply' });
  }
});

module.exports = router;
