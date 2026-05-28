import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Star, MessageSquare, Sparkles, Filter, ClipboardCopy,Check, ExternalLink } from 'lucide-react'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { useAuth } from '../../contexts/AuthContext'
import { formatTimestamp } from '../../utils/format'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import Button from '../../components/ui/button'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'suggested', label: 'Suggested' },
  { key: 'responded', label: 'Responded' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'failed', label: 'Failed' }
]

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-200'}`}
        />
      ))}
    </div>
  )
}

function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false)
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
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-slatey-200 bg-white/80 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {review.customerName[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-slatey-900">{review.customerName}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <StarRating rating={review.rating} />
              <span className="text-xs text-slatey-400">
                {formatTimestamp(review.reviewTimestamp || review.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <StatusBadge status={review.status} />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slatey-600">{review.text}</p>

      {aiResponse && (
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-brand-600">
              <Sparkles className="h-3 w-3" /> AI Reply
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slatey-600">{aiResponse}</p>
          {reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in Google review
            </a>
          ) : null}
        </div>
      )}

      {review.status === 'escalated' && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-100 bg-red-50/70 px-3 py-2 text-xs text-red-600">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 shrink-0" />
            WhatsApp alert sent to outlet manager
          </div>
          {review.processedAt ? (
            <p className="text-[11px] text-red-500/80">
              Processed at {formatTimestamp(review.processedAt)}
            </p>
          ) : null}
        </div>
      )}

      {review.status === 'pending' && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs text-amber-700">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          Awaiting AI processing — will be handled in the next cron run
        </div>
      )}

      {review.status === 'failed' && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50/70 px-3 py-2 text-xs text-rose-700">
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          Processing failed. Check logs for retry details.
        </div>
      )}
    </motion.div>
  )
}

export default function OutletReviewsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [minRating, setMinRating] = useState(0)
  const { outlet, profile } = useAuth()
  const [reviews, setReviews] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [counts, setCounts] = useState({ all: 0, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  const getRatingParam = (val) => {
    if (val === 4) return '4+'
    if (val === 3) return '3+'
    if (val === 1) return '1-2'
    return 'all'
  }

  const outletId = outlet?.id || profile?.outletId

  useEffect(() => {
    if (!outletId) {
      setReviews([])
      setLoading(false)
      return
    }

    setLoading(true)
    // Build Firestore query
    let q = query(
      collection(db, 'reviews'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(100)
    )

    // Filtering (client-side for now)
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        // Tab/status filter
        if (activeTab !== 'all') {
          data = data.filter((r) => (r.status || 'pending') === activeTab)
        }

        // Rating filter
        if (minRating === 4) {
          data = data.filter((r) => Number(r.rating || 0) >= 4)
        } else if (minRating === 3) {
          data = data.filter((r) => Number(r.rating || 0) >= 3)
        } else if (minRating === 1) {
          data = data.filter((r) => Number(r.rating || 0) <= 2)
        }

        // Search filter
        if (searchQuery) {
          const qstr = searchQuery.toLowerCase()
          data = data.filter(
            (r) =>
              (r.customerName || '').toLowerCase().includes(qstr) ||
              (r.text || '').toLowerCase().includes(qstr)
          )
        }

        setReviews(data)
        setPagination({ total: data.length, page: 1, limit: 100, totalPages: 1 })
        // Count statuses
        const counts = { all: 0, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 }
        data.forEach((r) => {
          const st = r.status || 'pending'
          counts[st] = (counts[st] || 0) + 1
          counts.all++
        })
        setCounts(counts)
        setLoading(false)
      },
      () => {
        setReviews([])
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [outletId, activeTab, minRating, searchQuery])

  const filtered = reviews

  const handleQueryChange = (val) => {
    setSearchQuery(val)
    setPage(1)
  }

  const handleRatingChange = (val) => {
    setMinRating(Number(val))
    setPage(1)
  }

  const handleTabChange = (val) => {
    setActiveTab(val)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Reviews</h2>
        <p className="text-sm text-slatey-500">Search, filter, and review AI-generated responses.</p>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slatey-400" />
          <input
            value={searchQuery}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search reviews or customer names…"
            className="w-full rounded-xl border border-slatey-200 bg-white/80 py-2.5 pl-9 pr-4 text-sm text-slatey-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slatey-400" />
          <select
            value={minRating}
            onChange={(e) => handleRatingChange(e.target.value)}
            className="rounded-xl border border-slatey-200 bg-white/80 px-3 py-2.5 text-sm text-slatey-700 outline-none focus:border-brand-400"
          >
            <option value={0}>All ratings</option>
            <option value={4}>4+ stars</option>
            <option value={3}>3+ stars</option>
            <option value={1}>1-2 stars</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-slatey-200 bg-slatey-50/80 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slatey-500 hover:text-slatey-700'
            }`}
          >
            {tab.label}
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none ${
              activeTab === tab.key ? 'bg-brand-100 text-brand-600' : 'bg-slatey-200 text-slatey-500'
            }`}>
              {counts[tab.key] || 0}
            </span>
          </button>
        ))}
      </div>

      {/* Review Grid */}
      <AnimatePresence mode="popLayout">
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <motion.div layout className="grid gap-4 lg:grid-cols-2">
            {filtered.map((review) => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </motion.div>
        ) : (
          <EmptyState
            title="No reviews yet"
            description="Waiting for the first sync. New reviews will appear automatically."
          />
        )}
      </AnimatePresence>

      {/* Pagination Controls */}
      {!loading && filtered.length > 0 && pagination.totalPages > 1 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slatey-100 bg-white/80 px-5 py-4 shadow-sm">
          <p className="text-xs text-slatey-500">
            Showing <span className="font-semibold text-slatey-700">{((page - 1) * pagination.limit) + 1}</span> to{' '}
            <span className="font-semibold text-slatey-700">{Math.min(page * pagination.limit, pagination.total)}</span> of{' '}
            <span className="font-semibold text-slatey-700">{pagination.total}</span> reviews
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
              className="text-xs font-semibold"
            >
              Previous
            </Button>
            
            {Array.from({ length: pagination.totalPages }).map((_, idx) => {
              const pNum = idx + 1;
              if (
                pagination.totalPages > 6 &&
                pNum !== 1 &&
                pNum !== pagination.totalPages &&
                Math.abs(pNum - page) > 1
              ) {
                if (pNum === 2 && page > 3) {
                  return <span key="dots1" className="px-1 text-slatey-400">...</span>;
                }
                if (pNum === pagination.totalPages - 1 && page < pagination.totalPages - 2) {
                  return <span key="dots2" className="px-1 text-slatey-400">...</span>;
                }
                return null;
              }

              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all ${
                    page === pNum
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand/20'
                      : 'text-slatey-500 hover:bg-slatey-50 hover:text-slatey-800'
                  }`}
                >
                  {pNum}
                </button>
              );
            })}

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
              disabled={page === pagination.totalPages}
              className="text-xs font-semibold"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
