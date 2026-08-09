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
  return import.meta.env.VITE_API_BASE_URL !== undefined ? normalizeApiBase(import.meta.env.VITE_API_BASE_URL) : ''
}

export const getApiBaseUrl = () => {
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return normalizeApiBase(import.meta.env.VITE_LOCAL_API_URL) || 'http://localhost:3000'
  }
  return normalizeApiBase(import.meta.env.VITE_API_BASE_URL) || window.location.origin
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
  }

  if (auth.currentUser) {
    const token = await auth.currentUser.getIdToken()
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMsg = error?.response?.data?.error || error?.response?.data?.message || ''
    if (error?.response?.status === 404 && (errorMsg.includes('no longer available') || errorMsg.includes('has been removed'))) {
      if (typeof window !== 'undefined' && window.toast) {
        window.toast.error('This outlet is no longer available.')
      }
    }
    return Promise.reject(error)
  }
)

export default apiClient
