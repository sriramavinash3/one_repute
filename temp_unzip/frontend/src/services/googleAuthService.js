import apiClient from './apiClient'
import axios from 'axios';

// Debounce utility to prevent repeated API calls
let debounceTimeout;
export function debounceApiCall(apiCall, delay = 300) {
  return (...args) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => apiCall(...args), delay);
  };
}

export async function getGoogleConnectionStatus(outletId) {
  if (!outletId) throw new Error('Outlet ID is required');

  const { data } = await apiClient.get('/api/auth/google/status', { params: { outletId } })
  return data
}

export async function setActiveGoogleLocation(outletId, locationId) {
  const { data } = await apiClient.post('/api/auth/google/active-location', { outletId, locationId })
  return data
}

export function startGoogleOAuth(outletId) {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
  const url = `${baseUrl}/api/auth/google?outletId=${encodeURIComponent(outletId)}`
  window.location.href = url
}

export async function syncBusinessData(outletId, forceRefresh = false) {
  if (!outletId) throw new Error('Outlet ID is required');
  const { data } = await apiClient.post('/api/google/sync-business-data', { outletId, forceRefresh })
  return data
}

// Example usage of debounced API call
export const debouncedGetGoogleConnectionStatus = debounceApiCall(
  getGoogleConnectionStatus,
  500 // 500ms debounce delay
);
