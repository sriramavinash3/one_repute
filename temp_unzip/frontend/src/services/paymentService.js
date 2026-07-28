import apiClient from './apiClient';

export async function createSubscription(customerId, planId) {
  const { data } = await apiClient.post('/api/payments/create-subscription', { customerId, planId });
  return data;
}

export async function verifyPayment(paymentId, signature, subscriptionId, customerId) {
  const { data } = await apiClient.post('/api/payments/verify', {
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    razorpay_subscription_id: subscriptionId,
    customerId
  });
  return data;
}

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => {
      resolve(true);
    };
    script.onerror = () => {
      resolve(false);
    };
    document.body.appendChild(script);
  });
}
