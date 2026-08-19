/**
 * Client-side review filtering + status counts, used by the mock-data and
 * Firestore-fallback data paths of the Outlet Reviews dashboard. The primary
 * REST path applies the same rules server-side.
 */

import { inDateRange } from './dateRange'

export const EMPTY_COUNTS = { all: 0, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 }

/** Normalize raw review status to standard dashboard tab keys */
export function normalizeStatus(status) {
  const val = String(status || '').toLowerCase().trim()
  if (val === 'reply_pending' || val === 'suggested') return 'suggested'
  if (val === 'pending' || val === 'imported') return 'pending'
  if (val === 'responded') return 'responded'
  if (val === 'escalated') return 'escalated'
  if (val === 'failed') return 'failed'
  return 'pending'
}

/**
 * Filter reviews by date range, status tab, rating bucket, and search text.
 * Keeps the same semantics as the REST API (status/rating/search/from/to).
 */
export function filterReviews(reviews, { activeTab = 'all', minRating = 0, search = '', from = null, to = null } = {}) {
  let data = reviews || []

  if (from || to) {
    data = data.filter((r) => inDateRange(r.reviewTimestamp || r.createdAt, from, to))
  }

  if (activeTab !== 'all') {
    if (activeTab === 'escalated') {
      data = data.filter(
        (r) =>
          normalizeStatus(r.status) === 'escalated' ||
          (r.escalationStatus && r.escalationStatus !== 'no_escalation' && r.escalationStatus !== 'resolved')
      )
    } else {
      data = data.filter((r) => normalizeStatus(r.status) === normalizeStatus(activeTab))
    }
  }

  if (minRating === 4) {
    data = data.filter((r) => Number(r.rating || 0) >= 4)
  } else if (minRating === 3) {
    data = data.filter((r) => Number(r.rating || 0) >= 3)
  } else if (minRating === 1) {
    data = data.filter((r) => Number(r.rating || 0) <= 2)
  }

  if (search) {
    const qstr = search.toLowerCase()
    data = data.filter(
      (r) =>
        (r.customerName || '').toLowerCase().includes(qstr) ||
        (r.text || '').toLowerCase().includes(qstr)
    )
  }

  return data
}

/** Compute per-status counts for a list (filtered by date range). */
export function computeStatusCounts(reviews) {
  const counts = { ...EMPTY_COUNTS }
  if (!Array.isArray(reviews)) return counts
  reviews.forEach((r) => {
    const st = normalizeStatus(r.status)
    if (counts[st] !== undefined) {
      counts[st]++
    }
    if (r.escalationStatus && r.escalationStatus !== 'no_escalation' && r.escalationStatus !== 'resolved') {
      counts.escalated++
    }
    counts.all++
  })
  return counts
}