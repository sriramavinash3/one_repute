import apiClient, { getApiBaseUrl } from './apiClient'
import axios from 'axios';

// Debounce utility to prevent repeated API calls
let debounceTimeout;
export function debounceApiCall(apiCall, delay = 300) {
  return (...args) => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => apiCall(...args), delay);
  };
}

/**
 * Builds a full backend URL from the shared API base URL.
 * - Appends exactly one slash and the given path (never "/api/api/...").
 * - Encodes query values; values that are empty/undefined/null are skipped.
 * - Logs the URL structure safely for OAuth debugging (no credentials here).
 */
export function buildOAuthUrl(path, queryParams = {}) {
  const baseUrl = getApiBaseUrl()
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const safePath = `/${String(path).replace(/^\/+/, '')}`
  const search = Object.entries(queryParams)
    .filter(([, value]) => typeof value === 'string' && value.length > 0)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
  const url = `${base}${safePath}${search ? `?${search}` : ''}`

  console.debug('[GoogleOAuth] URL structure:', {
    url,
    path: safePath,
    queryKeys: Object.keys(queryParams).filter((k) => typeof queryParams[k] === 'string' && queryParams[k].length > 0),
    malformed: Object.entries(queryParams).some(([, v]) => v === null || v === undefined || String(v).includes('"')),
  })

  return url
}

export async function getGoogleConnectionStatus(outletId) {
  if (!outletId) throw new Error('Outlet ID is required');

  console.debug('[GoogleOAuth] API call structure:', { method: 'GET', path: '/api/auth/google/status', params: ['outletId'] })
  const { data } = await apiClient.get('/api/auth/google/status', { params: { outletId } })
  return data
}

export async function setActiveGoogleLocation(outletId, locationId) {
  console.debug('[GoogleOAuth] API call structure:', { method: 'POST', path: '/api/auth/google/active-location', params: ['outletId', 'locationId'] })
  const { data } = await apiClient.post('/api/auth/google/active-location', { outletId, locationId })
  return data
}

export function startGoogleOAuth(outletId, uid) {
  if (!outletId || typeof outletId !== 'string' || outletId.includes('"') || outletId.includes('%22')) {
    console.error('[GoogleOAuth] refusing to start OAuth with malformed outletId:', JSON.stringify(outletId))
    throw new Error('Outlet ID is malformed (empty or contains quote characters). Check the user profile.outletId value in Firestore.')
  }
  const query = { outletId }
  if (uid && typeof uid === 'string' && !uid.includes('"') && !uid.includes('%22')) {
    query.uid = uid
  }
  const url = buildOAuthUrl('/api/auth/google', query)

  const width = 500
  const height = 600
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2

  const popup = window.open(url, 'Connect Google Business', `width=${width},height=${height},left=${left},top=${top}`)
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.location.href = url
  }
}

export async function syncBusinessData(outletId, forceRefresh = false) {
  if (!outletId) throw new Error('Outlet ID is required');
  console.debug('[GoogleOAuth] API call structure:', { method: 'POST', path: '/api/reviews/sync', params: ['outletId', 'forceRefresh'] })
  const { data } = await apiClient.post('/api/reviews/sync', { outletId, forceRefresh })
  return data
}

// Example usage of debounced API call
export const debouncedGetGoogleConnectionStatus = debounceApiCall(
  getGoogleConnectionStatus,
  500 // 500ms debounce delay
);
