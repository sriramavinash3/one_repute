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

export function splitPhoneNumber(rawNumber) {
  if (!rawNumber || typeof rawNumber !== 'string') {
    return { countryCode: '+91', number: '' }
  }

  const str = rawNumber.trim()
  if (!str) {
    return { countryCode: '+91', number: '' }
  }

  if (str.startsWith('+')) {
    const match = str.match(/^(\+(?:91|1|44|61|971|65|49|33|81|86|90|92|93|94|95|98|20|27|31|32|34|36|39|41|43|45|46|47|48|51|52|53|54|55|56|57|58|60|62|63|64|66|82|84|960|961|962|963|964|965|966|968|992|993|994|995|996|998|\d{1,3}))\s*(.*)$/)
    if (match) {
      return {
        countryCode: match[1],
        number: match[2].trim()
      }
    }
  }

  return {
    countryCode: '+91',
    number: str
  }
}
