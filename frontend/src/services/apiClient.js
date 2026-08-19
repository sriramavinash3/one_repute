import axios from 'axios'
import { auth } from '../firebase/firebase'

// API base URL contract: bare host, e.g. "http://localhost:3000" or "" (same origin).
// Endpoint paths always include the "/api" prefix themselves.
// This normalization strips an accidental trailing "/api" (or "/") so configs like
// VITE_API_BASE_URL=/api can never produce "/api/api/auth/google".
const normalizeApiBase = (raw) => {
  if (!raw) return raw
  let base = String(raw).trim()
  if (!base) return base
  base = base.replace(/\/+$/, '')
  base = base.replace(/\/api\/?$/, '')
  return base
}

export const getBaseUrl = () => {
  // If running locally in browser, default to http://localhost:3000 unless VITE_LOCAL_API_URL is set
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return normalizeApiBase(import.meta.env.VITE_LOCAL_API_URL) || 'http://localhost:3000'
  }
  // In production behind Nginx, relative path '' ensures requests go to /api on same domain
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw && (raw.includes('api.onerepute.com') || (typeof window !== 'undefined' && window.location.hostname.includes('onerepute.com')))) {
    return ''
  }
  return raw !== undefined ? normalizeApiBase(raw) : ''
}

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return normalizeApiBase(import.meta.env.VITE_LOCAL_API_URL) || 'http://localhost:3000'
  }
  const base = getBaseUrl()
  if (!base && typeof window !== 'undefined') {
    return window.location.origin
  }
  return base || (typeof window !== 'undefined' ? window.location.origin : '')
}

const apiClient = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json'
  }
})

apiClient.interceptors.request.use(async (config) => {
  // Enforce localhost base URL if in local environment
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    config.baseURL = import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3000'
  } else if (typeof window !== 'undefined' && (config.baseURL?.includes('api.onerepute.com') || window.location.hostname.includes('onerepute.com'))) {
    config.baseURL = ''
  }

  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const errorMsg = String(error?.response?.data?.error || error?.response?.data?.message || error?.message || '').toLowerCase()
    const errorCode = String(error?.response?.data?.code || '').toUpperCase()
    const config = error?.config

    const isQuotaError = status === 429 || errorCode === 'RESOURCE_EXHAUSTED' || errorMsg.includes('quota exceeded') || errorMsg.includes('resource_exhausted')

    if (isQuotaError && config && (config._retryCount === undefined || config._retryCount < 2)) {
      config._retryCount = (config._retryCount || 0) + 1
      const backoffMs = Math.pow(2, config._retryCount) * 1000 + Math.floor(Math.random() * 300)
      console.warn(`[apiClient] Firebase service quota limit hit. Retrying request (${config._retryCount}/2) in ${backoffMs}ms...`)
      await new Promise((resolve) => setTimeout(resolve, backoffMs))
      return apiClient(config)
    }

    if (status === 404 && (errorMsg.includes('no longer available') || errorMsg.includes('has been removed'))) {
      if (typeof window !== 'undefined' && window.toast) {
        window.toast.error('This outlet is no longer available.')
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
