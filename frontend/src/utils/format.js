export function formatRating(value) {
  return Number(value).toFixed(1)
}

export function formatTimestamp(value) {
  if (!value) return 'N/A'
  const date = typeof value === 'string'
    ? new Date(value)
    : value.toDate?.() || (value._seconds ? new Date(value._seconds * 1000) : new Date(value))
  return date.toLocaleString()
}
