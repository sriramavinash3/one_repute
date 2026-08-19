import apiClient from './apiClient'

export const getCachedReviewCount = (outletId) => {
  if (!outletId || typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`review_count_${outletId}`)
    if (raw !== null) {
      const num = Number(raw)
      if (!Number.isNaN(num) && num >= 0) return num
    }
  } catch (e) {
    console.warn('[reviewService] sessionStorage read error:', e)
  }
  return null
}

export const setCachedReviewCount = (outletId, count) => {
  if (!outletId || typeof window === 'undefined' || typeof count !== 'number') return
  try {
    sessionStorage.setItem(`review_count_${outletId}`, String(count))
  } catch (e) {
    console.warn('[reviewService] sessionStorage write error:', e)
  }
}

export const clearCachedReviewCount = (outletId) => {
  if (!outletId || typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(`review_count_${outletId}`)
  } catch (e) {
    console.warn('[reviewService] sessionStorage clear error:', e)
  }
}

export async function fetchReviews(params = {}) {
  const { data } = await apiClient.get('/api/reviews', { params })
  if (params?.outletId && typeof data?.totalReviews === 'number') {
    setCachedReviewCount(params.outletId, data.totalReviews)
  } else if (params?.outletId && typeof data?.pagination?.total === 'number') {
    setCachedReviewCount(params.outletId, data.pagination.total)
  }
  return data
}

export async function fetchReviewCount(outletId) {
  const cached = getCachedReviewCount(outletId)
  if (cached !== null) {
    return { totalReviews: cached, total: cached, cached: true }
  }
  const { data } = await apiClient.get('/api/reviews/count', { params: { outletId } })
  const count = typeof data?.totalReviews === 'number' ? data.totalReviews : (typeof data?.total === 'number' ? data.total : null)
  if (count !== null) {
    setCachedReviewCount(outletId, count)
  }
  return data
}

export async function fetchEscalations(params = {}) {
  const { data } = await apiClient.get('/api/escalations', { params })
  return data
}

export async function fetchAnalyticsSummary(params = {}) {
  const { data } = await apiClient.get('/api/analytics/summary', { params })
  return data
}

export async function postReviewReply(reviewId, outletId, replyText) {
  const { data } = await apiClient.post(`/api/reviews/${reviewId}/reply`, { outletId, replyText })
  return data
}

export async function reprocessReview(reviewId) {
  const { data } = await apiClient.post(`/api/reviews/${reviewId}/reprocess`)
  return data
}
