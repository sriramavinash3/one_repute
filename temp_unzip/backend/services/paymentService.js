const Razorpay = require('razorpay');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { getDb } = require('../config/firebase');

let razorpayInstance = null;

function getRazorpay() {
  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || 'dummy_key_id',
      key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_key_secret',
    });
  }
  return razorpayInstance;
}

async function createSubscription(customerId, planId) {
  try {
    const rzp = getRazorpay();
    const subscription = await rzp.subscriptions.create({
      plan_id: planId,
      customer_notify: 1,
      total_count: 120, // 10 years
    });

    const db = getDb();
    await db.collection('customers').doc(customerId).update({
      razorpaySubscriptionId: subscription.id,
      subscriptionStatus: 'created',
      plan: planId,
    });

    return subscription;
  } catch (error) {
    logger.error('Error creating Razorpay subscription', { error });
    throw error;
  }
}

async function verifyPayment(paymentId, signature, subscriptionId) {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET || 'dummy_key_secret';
    const generatedSignature = crypto.createHmac('sha256', secret)
      .update(paymentId + '|' + subscriptionId)
      .digest('hex');

    if (generatedSignature !== signature) {
      throw new Error('Invalid signature');
    }
    return true;
  } catch (error) {
    logger.error('Error verifying payment signature', { error });
    throw error;
  }
}

module.exports = {
  createSubscription,
  verifyPayment
};
