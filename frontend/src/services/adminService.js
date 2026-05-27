import apiClient from './apiClient'

export async function fetchSystemLogs(page = 1, pageSize = 10) {
  const { data } = await apiClient.get(`/api/admin/logs?page=${page}&pageSize=${pageSize}`)
  return data
}

export async function triggerCronJob() {
  const { data } = await apiClient.post('/api/admin/trigger-cron')
  return data
}

export async function createOutlet(payload) {
  const { data } = await apiClient.post('/api/admin/outlets', payload)
  return data
}

export async function deleteOutlet(outletId) {
  const { data } = await apiClient.delete(`/api/admin/outlets/${outletId}`)
  return data
}

export async function fetchCredits() {
  const { data } = await apiClient.get('/api/admin/credits')
  return data
}
