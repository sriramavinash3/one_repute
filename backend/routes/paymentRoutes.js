'use strict';

const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');
const { getDb } = require('../config/firebase');

router.post('/create-subscription', async (req, res) => {
  try {
    const { customerId, planId } = req.body;
    if (!customerId || !planId) {
      return res.status(400).json({ error: 'customerId and planId are required' });
    }
    const subscription = await paymentService.createSubscription(customerId, planId);
    res.status(200).json(subscription);
  } catch (err) {
    logger.error('Failed to create subscription', { error: err.message });
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

router.post('/verify', async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_signature, razorpay_subscription_id, customerId } = req.body;
    const isValid = await paymentService.verifyPayment(razorpay_payment_id, razorpay_signature, razorpay_subscription_id);
    
    if (isValid) {
      const db = getDb();
      await db.collection('customers').doc(customerId).update({
        subscriptionStatus: 'active',
        razorpayPaymentId: razorpay_payment_id
      });
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, error: 'Invalid signature' });
    }
  } catch (err) {
    logger.error('Payment verification failed', { error: err.message });
    res.status(500).json({ error: 'Verification failed' });
  }
});

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Webhook implementation goes here
  res.status(200).send('OK');
});

module.exports = router;
