import apiClient from './apiClient'
import { db } from '../firebase/firebase'
import { collection, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore'

const COLLECTION = 'outlets'

export async function fetchOutlets() {
  // Use backend for complex list (includes Google data status)
  const { data } = await apiClient.get('/api/outlets')
  return data
}

export async function fetchAdminOutlets() {
  const { data } = await apiClient.get('/api/admin/outlets')
  return data
}

export async function createAdminOutlet(payload) {
  // Creating outlets involves backend logic (initialization, etc.)
  const { data } = await apiClient.post('/api/admin/outlets', payload)
  return data
}

export async function fetchPlaceSuggestions(input, sessionToken) {
  const { data } = await apiClient.get('/api/admin/places/autocomplete', {
    params: { input, sessiontoken: sessionToken },
  })
  return data.suggestions || []
}

export async function fetchPlaceDetails(placeId, sessionToken) {
  const { data } = await apiClient.get('/api/admin/places/details', {
    params: { placeId, sessiontoken: sessionToken },
  })
  return data.place
}

export async function toggleAdminOutletStatus(outletId, isActive) {
  const { data } = await apiClient.patch(`/api/admin/outlets/${outletId}/status`, { isActive })
  return data
}

export async function deleteAdminOutlet(outletId) {
  const { data } = await apiClient.delete(`/api/admin/outlets/${outletId}`)
  return data
}

export async function fetchOutletById(outletId) {
  const docSnap = await getDoc(doc(db, COLLECTION, outletId))
  if (docSnap.exists()) {
    const data = docSnap.data()
    if (data.status === 'removed' || data.isDeleted === true || data.status === 'deleted') {
      return null
    }
    return { id: docSnap.id, ...data }
  }
  return null
}

export async function updateOutlet(outletId, payload) {
  const { data } = await apiClient.post(`/api/outlets/${outletId}`, payload)
  return { message: 'Outlet updated', ...data }
}

export async function fetchOutletSettings(outletId) {
  const docSnap = await getDoc(doc(db, COLLECTION, outletId))
  return docSnap.exists() ? docSnap.data() : null
}

export async function updateOutletSettings(outletId, settings) {
  const { data } = await apiClient.post(`/api/outlets/${outletId}`, settings)
  return { message: 'Settings updated', ...data }
}

export async function fetchOutletReputationInsights(params = {}) {
  // Using the new outlet-specific endpoint
  const { data } = await apiClient.get('/api/outlets/reputation-insights', { params })
  return data
}

export async function submitCategoryRule(outletId, rulePayload) {
  const { data } = await apiClient.post('/api/outlets/reputation-insights/rules', {
    outletId,
    ...rulePayload
  })
  return data
}
