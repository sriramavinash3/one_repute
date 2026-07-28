import { useState } from 'react'
import { ClipboardCopy, ExternalLink, Check } from 'lucide-react'
import StatusBadge from '../feedback/StatusBadge'
import { formatTimestamp } from '../../utils/format'

export default function ReviewCard({ review }) {
  const [copied, setCopied] = useState(false)

  const aiResponse = review.aiResponse || review.replySuggestion || ''
  const reviewUrl = review.reviewUrl || review.raw?.reviewUrl || ''

  const handleCopy = async () => {
    if (!aiResponse) return
    try {
      await navigator.clipboard.writeText(aiResponse)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="rounded-2xl border border-slatey-200 bg-white/80 p-5 shadow-sm dark:border-slatey-700 dark:bg-slatey-900/70">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slatey-900 dark:text-slatey-100">{review.customerName}</p>
          <p className="text-xs text-slatey-500">Rating {review.rating}/5</p>
        </div>
        <StatusBadge status={review.status} />
      </div>
      <p className="mt-4 text-sm text-slatey-600 dark:text-slatey-300">{review.text}</p>
      {aiResponse ? (
        <div className="mt-4 rounded-xl border border-slatey-200 bg-slatey-50 px-4 py-3 text-xs text-slatey-600 dark:border-slatey-700 dark:bg-slatey-800/70 dark:text-slatey-200">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slatey-400">AI reply</p>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-slatey-200 px-2.5 py-1 text-[11px] font-medium text-slatey-600 transition hover:border-brand-300 hover:text-brand-600"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2">{aiResponse}</p>
          {reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Google review
            </a>
          ) : null}
          {review.status === 'escalated' && review.processedAt ? (
            <p className="mt-3 text-[11px] text-slatey-400">
              Processed at {formatTimestamp(review.processedAt)}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
