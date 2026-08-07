import axios from 'axios'
import { auth } from '../firebase/firebase'

const getBaseUrl = () => {
  // If running locally in browser, default to http://localhost:3000 unless VITE_LOCAL_API_URL is set
  if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    return import.meta.env.VITE_LOCAL_API_URL || 'http://localhost:3000'
  }
  return import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000'
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
}, (error) => {
  return Promise.reject(error)
})

export default apiClient

