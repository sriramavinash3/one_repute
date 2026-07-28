import apiClient from './apiClient'

export async function fetchSystemLogs({
  page = 1,
  pageSize = 25,
  status = 'all',
  search = ''
}) {
  const response = await apiClient.get('/api/admin/logs', {
    params: {
      page,
      pageSize,
      status,
      search
    }
  })
  console.log(response);

  return response.data
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

export async function fetchUsageInsights() {
  const { data } = await apiClient.get('/api/admin/usage-insights')
  return data
}

export async function fetchReputationInsights() {
  const { data } = await apiClient.get('/api/admin/reputation-insights')
  return data
}
