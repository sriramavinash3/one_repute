import apiClient from './apiClient';

export async function createSubscription(planId, billingCycle = 'monthly', countryCode = 'IN', customerId) {
  const { data } = await apiClient.post('/api/payments/create-subscription', {
    planId,
    billingCycle,
    countryCode,
    customerId,
  });
  return data;
}

export async function verifyPayment(paymentId, signature, subscriptionId, customerId) {
  const { data } = await apiClient.post('/api/payments/verify', {
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    razorpay_subscription_id: subscriptionId,
    customerId,
  });
  return data;
}

export async function fetchBillingInfo() {
  const { data } = await apiClient.get('/api/payments/billing-info');
  return data;
}

export async function changePlan(newPlanId, billingCycle = 'monthly') {
  const { data } = await apiClient.post('/api/payments/change-plan', { newPlanId, billingCycle });
  return data;
}

export async function cancelSubscription() {
  const { data } = await apiClient.post('/api/payments/cancel');
  return data;
}

export async function resumeSubscription() {
  const { data } = await apiClient.post('/api/payments/resume');
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
