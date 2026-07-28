import apiClient from './apiClient'

export async function fetchReviews(params = {}) {
  const { data } = await apiClient.get('/api/reviews', { params })
  return data
}

export async function fetchEscalations(params = {}) {
  const { data } = await apiClient.get('/api/reviews/escalations', { params })
  return data
}

export async function fetchAnalyticsSummary(params = {}) {
  const { data } = await apiClient.get('/api/analytics/summary', { params })
  return data
}
