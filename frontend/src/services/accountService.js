import apiClient from './apiClient';

/**
 * Request account deletion OTP code.
 * Backend sends OTP to verified user email address.
 */
export async function requestAccountDeletionOtp() {
  const response = await apiClient.post('/api/account/delete/request');
  return response.data;
}

/**
 * Verify account deletion OTP code and execute server-side deletion.
 * @param {string} otp - 6-digit numeric OTP code
 */
export async function verifyAccountDeletionOtp(otp) {
  const response = await apiClient.post('/api/account/delete/verify', { otp });
  return response.data;
}
