import apiClient from './apiClient'

/**
 * Fetch escalation settings (master toggle, levels, plan, credits status)
 */
export async function fetchEscalationSettings() {
  const { data } = await apiClient.get('/api/escalation/settings')
  return data
}

/**
 * Save level configurations or master toggle
 *
 * @param {Object} payload
 */
export async function saveEscalationSettings(payload) {
  const { data } = await apiClient.post('/api/escalation/settings', payload)
  return data
}

/**
 * Delete configuration for a specific level
 *
 * @param {number} level
 */
export async function deleteEscalationLevel(level) {
  const { data } = await apiClient.delete(`/api/escalation/settings/${level}`)
  return data
}

/**
 * Fetch escalation alert history
 */
export async function fetchEscalationHistory() {
  const { data } = await apiClient.get('/api/escalation/history')
  return data
}

/**
 * Fetch escalation progress for a specific review
 *
 * @param {string} reviewId
 */
export async function fetchReviewEscalationStatus(reviewId) {
  const { data } = await apiClient.get(`/api/escalation/status/${reviewId}`)
  return data
}
