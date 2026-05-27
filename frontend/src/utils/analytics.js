export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function computeStatusCounts(reviews) {
  const counts = {
    pending: 0,
    suggested: 0,
    escalated: 0,
    responded: 0,
    failed: 0
  }

  for (const review of reviews || []) {
    let status = String(review.status || 'pending').toLowerCase()
    if (status === 'reply_pending') status = 'suggested'
    if (counts[status] !== undefined) {
      counts[status] += 1
    }
  }

  return counts
}

export function computeRatingStats(reviews) {
  const total = reviews.length
  if (total === 0) {
    return {
      averageRating: 0,
      positiveReviews: 0,
      negativeReviews: 0,
      neutralReviews: 0
    }
  }

  let sum = 0
  let positive = 0
  let negative = 0
  let neutral = 0

  for (const review of reviews) {
    const rating = Number(review.rating || 0)
    if (!rating) continue
    sum += rating
    if (rating >= 4) positive += 1
    else if (rating <= 2) negative += 1
    else neutral += 1
  }

  return {
    averageRating: sum / Math.max(total, 1),
    positiveReviews: positive,
    negativeReviews: negative,
    neutralReviews: neutral
  }
}

export function buildDailyTrend(reviews, days = 7) {
  const now = new Date()
  const buckets = []

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now)
    date.setDate(now.getDate() - i)
    const key = date.toISOString().slice(0, 10)
    buckets.push({
      key,
      name: date.toLocaleDateString(undefined, { weekday: 'short' }),
      reviews: 0,
      escalations: 0,
      responded: 0
    })
  }

  const index = new Map(buckets.map((b) => [b.key, b]))

  for (const review of reviews) {
    const createdAt = toDate(review.reviewTimestamp || review.createdAt)
    if (!createdAt) continue
    const key = createdAt.toISOString().slice(0, 10)
    const bucket = index.get(key)
    if (!bucket) continue

    bucket.reviews += 1
    if (String(review.status).toLowerCase() === 'escalated') {
      bucket.escalations += 1
    }
    if (String(review.status).toLowerCase() === 'responded') {
      bucket.responded += 1
    }
  }

  return buckets
}

export function buildRatingDistribution(reviews) {
  const dist = [1, 2, 3, 4, 5].map((rating) => ({ name: `${rating}★`, value: 0 }))

  for (const review of reviews) {
    const rating = Number(review.rating || 0)
    if (!rating || rating < 1 || rating > 5) continue
    dist[rating - 1].value += 1
  }

  return dist.reverse()
}

export function buildSentimentMix(reviews) {
  const { positiveReviews, negativeReviews, neutralReviews } = computeRatingStats(reviews)
  const total = Math.max(positiveReviews + negativeReviews + neutralReviews, 1)

  return [
    { name: 'Positive', value: Math.round((positiveReviews / total) * 100), color: '#10b981' },
    { name: 'Neutral', value: Math.round((neutralReviews / total) * 100), color: '#f59e0b' },
    { name: 'Negative', value: Math.round((negativeReviews / total) * 100), color: '#ef4444' }
  ]
}

export function groupReviewsByOutlet(reviews, outlets) {
  const outletMap = new Map((outlets || []).map((o) => [o.id, o]))
  const stats = new Map()

  for (const review of reviews) {
    const outletId = review.outletId
    if (!outletId) continue
    const entry = stats.get(outletId) || { outletId, reviews: [], avgRating: 0 }
    entry.reviews.push(review)
    stats.set(outletId, entry)
  }

  return Array.from(stats.values())
    .map((entry) => {
      const ratingStats = computeRatingStats(entry.reviews)
      return {
        outletId: entry.outletId,
        name: outletMap.get(entry.outletId)?.name || entry.outletId,
        avgRating: ratingStats.averageRating,
        reviewCount: entry.reviews.length
      }
    })
    .sort((a, b) => b.avgRating - a.avgRating)
}
