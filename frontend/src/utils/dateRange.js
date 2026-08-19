/**
 * Date-range helpers for the Reviews dashboard.
 *
 * All presets are computed against the user's LOCAL timezone, then converted
 * to UTC instants before being sent to the API, so day boundaries are
 * correct for the viewer regardless of server timezone.
 */

export const DATE_PRESETS = [
  { key: 'all', label: 'All dates' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom range' },
]

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

/**
 * Parse a date input into a local Date. Accepts:
 * - Date instances
 * - "YYYY-MM-DD" (treated as local midnight, matches <input type="date">)
 * - any Date.parse()-able string
 * Returns null for invalid input.
 */
export function parseDateInput(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value)
  if (!value) return null
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return null
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return Number.isNaN(date.getTime()) ? null : date
    }
    const date = new Date(raw)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

/**
 * Resolve a review's timestamp to epoch milliseconds regardless of shape:
 * Date, ISO string, Firestore Timestamp (.toDate()), Firestore
 * {seconds, nanoseconds} plain object, or raw number.
 */
export function getReviewTimestampMs(value) {
  if (!value) return null
  if (typeof value === 'number') return Number.isNaN(value) ? null : value
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  if (value instanceof Date) return value.getTime()
  if (typeof value.toDate === 'function') return value.toDate().getTime()
  if (value._seconds != null || value.seconds != null) {
    const seconds = value._seconds ?? value.seconds
    const nanos = value._nanoseconds ?? value.nanoseconds ?? 0
    return Number(seconds) * 1000 + Number(nanos) / 1e6
  }
  return null
}

/**
 * Compute the inclusive {from, to} window (local timezone) for a preset.
 * Returns { from: null, to: null } for "all" or an invalid custom range
 * (missing dates, unparseable, or reversed).
 */
export function computeDateRange(preset, customRange, now = new Date()) {
  if (!preset || preset === 'all') return { from: null, to: null }

  if (preset === 'custom') {
    if (!customRange?.start || !customRange?.end) return { from: null, to: null }
    const start = parseDateInput(customRange.start)
    const end = parseDateInput(customRange.end)
    if (!start || !end || start.getTime() > end.getTime()) return { from: null, to: null }
    return { from: startOfDay(start), to: endOfDay(end) }
  }

  const today = startOfDay(now)
  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) }
    case 'yesterday': {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      return { from: yesterday, to: endOfDay(yesterday) }
    }
    case '7d': {
      const from = new Date(today)
      from.setDate(from.getDate() - 6)
      return { from, to: endOfDay(now) }
    }
    case '30d': {
      const from = new Date(today)
      from.setDate(from.getDate() - 29)
      return { from, to: endOfDay(now) }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      return { from, to: endOfDay(now) }
    }
    default:
      return { from: null, to: null }
  }
}

/** True when the review timestamp falls inside the inclusive [from, to] window. */
export function inDateRange(value, from, to) {
  const ms = getReviewTimestampMs(value)
  if (ms == null) return !from && !to
  if (from && ms < from.getTime()) return false
  if (to && ms > to.getTime()) return false
  return true
}

export function formatRangeLabel(from, to) {
  if (!from && !to) return ''
  const fmt = (d) =>
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  if (from && to) return `${fmt(from)} – ${fmt(to)}`
  if (from) return `From ${fmt(from)}`
  return `Until ${fmt(to)}`
}

/** Format a Date as "YYYY-MM-DD" for <input type="date"> values. */
export function toDateInputValue(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}