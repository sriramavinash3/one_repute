import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Star, Sparkles, Filter, ClipboardCopy, Check, X, Clock, CheckCircle, Mail, Phone, CalendarDays, RotateCcw, Send, RefreshCw, AlertCircle, Loader2 } from 'lucide-react'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { useAuth } from '../../contexts/AuthContext'
import { formatTimestamp } from '../../utils/format'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import Button from '../../components/ui/button'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_REVIEWS } from '../../config/mockData'
import { fetchReviewEscalationStatus } from '../../services/escalationService'
import { fetchReviews, getCachedReviewCount, setCachedReviewCount, postReviewReply, reprocessReview } from '../../services/reviewService'
import { DATE_PRESETS, computeDateRange, formatRangeLabel } from '../../utils/dateRange'
import { EMPTY_COUNTS, computeStatusCounts, filterReviews } from '../../utils/reviewFilters'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'suggested', label: 'Suggested' },
  { key: 'responded', label: 'Responded' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'failed', label: 'Failed' }
]

// Server-side query params for the Reviews API (GET /api/reviews)
const STATUS_API_MAP = {
  pending: 'pending',
  suggested: 'suggested',
  responded: 'responded',
  escalated: 'escalated',
  failed: 'failed',
}

const RATING_API_MAP = { 4: '4+', 3: '3+', 1: '1-2' }

const PAGE_LIMIT = 50

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

function EscalationTimer({ nextTime }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    if (!nextTime) {
      setTimeLeft('')
      return
    }

    const interval = setInterval(() => {
      const target = nextTime.toDate ? nextTime.toDate().getTime() : new Date(nextTime).getTime()
      const diff = target - Date.now()

      if (diff <= 0) {
        setTimeLeft('Escalating...')
        clearInterval(interval)
      } else {
        const hrs = Math.floor(diff / 3600000)
        const mins = Math.floor((diff % 3600000) / 60000)
        const secs = Math.floor((diff % 60000) / 1000)

        const pad = (num) => String(num).padStart(2, '0')
        if (hrs > 0) {
          setTimeLeft(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`)
        } else {
          setTimeLeft(`${pad(mins)}:${pad(secs)}`)
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [nextTime])

  if (!timeLeft) return null

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 animate-pulse">
      ⏳ {timeLeft}
    </span>
  )
}

function ReviewCard({ review, onSelect }) {
  const [copied, setCopied] = useState(false)
  const aiResponse = review.aiResponse || review.replySuggestion || ''
  const reviewUrl = review.reviewUrl || review.raw?.reviewUrl || ''

  const handleCopy = async (e) => {
    e.stopPropagation()
    if (!aiResponse) return
    try {
      await navigator.clipboard.writeText(aiResponse)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const isEscalating = review.escalationStatus && review.escalationStatus.endsWith('_pending')

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.25 }}
      onClick={() => onSelect(review)}
      className="rounded-2xl border border-slatey-200 bg-white/80 p-5 shadow-sm hover:shadow-md transition cursor-pointer relative"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
            {review.customerName ? review.customerName[0] : 'C'}
          </div>
          <div>
            <p className="text-sm font-semibold text-slatey-900">{review.customerName || 'Customer'}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <StarRating rating={review.rating} />
              <span className="text-xs text-slatey-400">
                {formatTimestamp(review.reviewTimestamp || review.createdAt)}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(review.isImported || review.isOnboarding || review.status === 'imported') && (
            <span className="rounded-full bg-purple-50 px-2.5 py-0.5 text-[11px] font-bold text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20">
              Imported
            </span>
          )}
          {isEscalating && <EscalationTimer nextTime={review.nextEscalationTime} />}
          <StatusBadge status={review.escalationStatus || review.status} />
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-slatey-600 line-clamp-3">{review.text}</p>

      {aiResponse && (
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-brand-600">
              <Sparkles className="h-3 w-3" /> AI Reply
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-brand-700 transition hover:bg-brand-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slatey-600 line-clamp-2">{aiResponse}</p>
        </div>
      )}

      {review.escalationStatus && review.escalationStatus !== 'no_escalation' && (
        <div className="mt-3 flex items-center justify-between bg-slatey-50 rounded-xl px-3 py-2 border border-slatey-150 text-[11px] text-slatey-500">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3 w-3 text-brand-500" />
            Escalation level: <span className="font-semibold text-slatey-700 capitalize">{String(review.escalationStatus).replace('_pending', '').replace('_', ' ')}</span>
          </span>
          <span className="text-[10px] text-slatey-400 font-medium">Click card to view details</span>
        </div>
      )}
    </motion.div>
  )
}

function ReviewDetailsDrawer({ review: initialReview, onClose, onUpdateReview }) {
  const [review, setReview] = useState(initialReview)
  const [timeline, setTimeline] = useState([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [copied, setCopied] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishSuccess, setPublishSuccess] = useState(false)
  const [publishError, setPublishError] = useState(null)
  const [reprocessing, setReprocessing] = useState(false)

  const aiResponse = review.aiResponse || review.replySuggestion || ''

  useEffect(() => {
    setReview(initialReview)
  }, [initialReview])

  useEffect(() => {
    if (!review.id) return

    setLoadingTimeline(true)
    fetchReviewEscalationStatus(review.id)
      .then((data) => {
        setTimeline(data.timeline || [])
      })
      .catch((err) => {
        console.error('Failed to load escalation timeline', err)
      })
      .finally(() => {
        setLoadingTimeline(false)
      })
  }, [review.id])

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

  const handlePublish = async () => {
    if (!aiResponse) return
    setPublishing(true)
    setPublishError(null)
    try {
      const res = await postReviewReply(review.id, review.outletId, aiResponse)
      setPublishSuccess(true)
      const updated = { ...review, status: 'responded', repliedAt: res.repliedAt || new Date().toISOString() }
      setReview(updated)
      if (onUpdateReview) onUpdateReview(updated)
    } catch (err) {
      setPublishError(err?.response?.data?.error || err.message || 'Failed to publish reply to Google Business Profile')
    } finally {
      setPublishing(false)
    }
  }

  const handleReprocess = async () => {
    setReprocessing(true)
    setPublishError(null)
    try {
      const res = await reprocessReview(review.id)
      if (res?.data?.review) {
        const updated = res.data.review
        setReview(updated)
        if (onUpdateReview) onUpdateReview(updated)
      }
    } catch (err) {
      setPublishError(err?.response?.data?.error || err.message || 'Failed to reprocess review')
    } finally {
      setReprocessing(false)
    }
  }

  const isEscalating = review.escalationStatus && review.escalationStatus.endsWith('_pending')

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slatey-900/40" onClick={onClose} />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white border-l border-slatey-200 shadow-2xl flex flex-col dark:bg-slatey-900 dark:border-slatey-800"
      >
      {/* Drawer Header */}
      <div className="p-5 border-b border-slatey-150 flex items-center justify-between bg-slatey-50">
        <div>
          <h3 className="text-base font-bold text-slatey-900">Review Details</h3>
          <p className="text-xs text-slatey-400 mt-0.5">ID: {review.id}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg border border-slatey-200 bg-white text-slatey-500 hover:text-slatey-800 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Customer Information */}
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700 shrink-0">
              {review.customerName ? review.customerName[0] : 'C'}
            </div>
            <div className="space-y-1">
              <h4 className="font-bold text-slatey-900">{review.customerName || 'Customer'}</h4>
              <div className="flex items-center gap-2">
                <StarRating rating={review.rating} />
                <span className="text-xs text-slatey-400">
                  {formatTimestamp(review.reviewTimestamp || review.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slatey-600 bg-slatey-50 p-4 rounded-2xl border border-slatey-100">
            "{review.text}"
          </p>
        </div>

        {/* AI Suggested Response */}
        {aiResponse && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slatey-500 uppercase tracking-wider">AI Suggested Reply</h4>
              <button
                onClick={handleCopy}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-brand-700 bg-brand-50 border border-brand-200 rounded-lg transition hover:bg-brand-100"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-sm leading-relaxed text-slatey-600 bg-brand-50/30 p-4 rounded-2xl border border-brand-100">
              {aiResponse}
            </p>

            {/* Status Feedback & Action Buttons */}
            {review.status !== 'responded' && (
              <div className="space-y-2 pt-2">
                {publishError && (
                  <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">Failed to publish reply</p>
                      <p className="mt-0.5 text-[11px]">{publishError}</p>
                    </div>
                  </div>
                )}
                {publishSuccess && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                    <CheckCircle className="h-4 w-4" /> Reply successfully published to Google Business Profile!
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handlePublish}
                    disabled={publishing || reprocessing}
                    className="flex-1 shadow-brand text-xs py-2 flex items-center justify-center gap-2"
                  >
                    {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    {publishing ? 'Publishing to Google…' : 'Publish Reply to Google'}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleReprocess}
                    disabled={publishing || reprocessing}
                    className="text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    {reprocessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Reprocess
                  </Button>
                </div>
              </div>
            )}
            {review.status === 'responded' && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-700">
                <CheckCircle className="h-4 w-4" /> Published to Google Business Profile {review.repliedAt ? `on ${formatTimestamp(review.repliedAt)}` : ''}
              </div>
            )}
          </div>
        )}

        {/* Multi-Level Escalation Timeline Section */}
        {review.escalationStatus && review.escalationStatus !== 'no_escalation' && (
          <div className="space-y-4 pt-4 border-t border-slatey-100">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slatey-500 uppercase tracking-wider">Escalation Activity Timeline</h4>
              <div className="flex items-center gap-2">
                {isEscalating && <EscalationTimer nextTime={review.nextEscalationTime} />}
                <StatusBadge status={review.escalationStatus} />
              </div>
            </div>

            {loadingTimeline ? (
              <div className="space-y-3 py-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="relative border-l border-slatey-200 pl-4 ml-2.5 space-y-5">
                {/* Node 1: Review Received */}
                <div className="relative">
                  <span className="absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 ring-4 ring-white">
                    <CheckCircle className="h-3 w-3 text-white" />
                  </span>
                  <div className="text-xs">
                    <p className="font-semibold text-slatey-800">Negative Review Received</p>
                    <p className="text-slatey-400 mt-0.5">
                      Ingested and analyzed at {formatTimestamp(review.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Node 2: Escalation Process Initiated */}
                <div className="relative">
                  <span className="absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-brand-600 ring-4 ring-white">
                    <Clock className="h-3 w-3 text-white" />
                  </span>
                  <div className="text-xs">
                    <p className="font-semibold text-slatey-800">Escalation Timer Started</p>
                    <p className="text-slatey-400 mt-0.5">
                      Multi-level notification checks scheduled.
                    </p>
                  </div>
                </div>

                {/* API History Logs */}
                {timeline.map((log, idx) => {
                  const isSuccess = log.status === 'success'
                  return (
                    <div key={log.id || idx} className="relative">
                      <span className={`absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full ring-4 ring-white ${isSuccess ? 'bg-green-600' : 'bg-red-500'}`}>
                        {log.channel === 'WhatsApp' ? (
                          <Phone className="h-2 w-2 text-white" />
                        ) : (
                          <Mail className="h-2 w-2 text-white" />
                        )}
                      </span>
                      <div className="text-xs">
                        <p className="font-semibold text-slatey-800">
                          Level {log.level} {log.channel} Alert {isSuccess ? 'Sent' : 'Failed'}
                        </p>
                        <p className="text-slatey-500 mt-0.5">
                          Sent to {log.recipientName} ({log.channel === 'WhatsApp' ? log.recipientWhatsApp : log.recipientEmail})
                        </p>
                        {log.sentAt && (
                          <p className="text-[10px] text-slatey-400 mt-0.5">
                            {formatTimestamp(log.sentAt)}
                          </p>
                        )}
                        {!isSuccess && log.errorMessage && (
                          <p className="mt-1 text-[11px] bg-red-50 text-red-600 border border-red-150 p-2 rounded-lg leading-relaxed">
                            Error: {log.errorMessage}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Active Pending State Node */}
                {isEscalating && review.nextEscalationTime && (
                  <div className="relative">
                    <span className="absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 ring-4 ring-white animate-pulse">
                      <Clock className="h-3 w-3 text-white" />
                    </span>
                    <div className="text-xs">
                      <p className="font-semibold text-slatey-800">
                        Waiting for Level {review.escalationCurrentLevel} Escalation Timer
                      </p>
                      <p className="text-slatey-400 mt-0.5">
                        Will escalate at {formatTimestamp(review.nextEscalationTime)} if unresolved.
                      </p>
                    </div>
                  </div>
                )}

                {/* Node: Complete/Resolved */}
                {review.escalationStatus === 'completed' && (
                  <div className="relative">
                    <span className="absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-slatey-400 ring-4 ring-white">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </span>
                    <div className="text-xs">
                      <p className="font-semibold text-slatey-800">Escalation Completed</p>
                      <p className="text-slatey-400 mt-0.5">All configured levels notifications exhausted.</p>
                    </div>
                  </div>
                )}

                {review.escalationStatus === 'resolved' && (
                  <div className="relative">
                    <span className="absolute -left-[23px] top-0 flex h-4 w-4 items-center justify-center rounded-full bg-green-600 ring-4 ring-white">
                      <CheckCircle className="h-3 w-3 text-white" />
                    </span>
                    <div className="text-xs">
                      <p className="font-semibold text-slatey-800">Escalation Stopped & Resolved</p>
                      <p className="text-slatey-400 mt-0.5">Stopped because review was responded to or closed.</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
    </>
  )
}

export default function OutletReviewsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [minRating, setMinRating] = useState(0)
  const [datePreset, setDatePreset] = useState('all')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [appliedCustom, setAppliedCustom] = useState(null)
  const { outlet, profile } = useAuth()
  const [reviews, setReviews] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: PAGE_LIMIT, totalPages: 1 })
  const [counts, setCounts] = useState(EMPTY_COUNTS)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedReview, setSelectedReview] = useState(null)
  // 'rest' (primary, server-side sort/filter/pagination) or 'firestore' (fallback)
  const [dataSource, setDataSource] = useState('rest')

  const outletId = outlet?.id || profile?.outletId

  // Latest-ref so drawer sync inside fetch callbacks never triggers refetches.
  const selectedReviewRef = useRef(null)
  useEffect(() => {
    selectedReviewRef.current = selectedReview
  })

  // Debounce search input so each keystroke does not fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Resolve the selected date range in the user's local timezone.
  const { from, to } = useMemo(
    () => computeDateRange(datePreset, datePreset === 'custom' ? appliedCustom : null),
    [datePreset, appliedCustom]
  )
  const isDateFilterActive = Boolean(from || to)

  const isSessionOutletRemoved = outlet?.status === 'removed' || outlet?.isDeleted === true

  const lastFetchKeyRef = useRef('')

  // Pre-populate total count from sessionStorage cache if available for this outlet
  useEffect(() => {
    if (!outletId) return
    const cachedCount = getCachedReviewCount(outletId)
    if (cachedCount !== null && cachedCount > 0) {
      setPagination((prev) => ({
        ...prev,
        total: cachedCount,
        totalPages: Math.ceil(cachedCount / PAGE_LIMIT) || 1,
      }))
    }
  }, [outletId])

  // Data loading: REST API primary with database-level 50-item limit & offset pagination
  useEffect(() => {
    if (USE_MOCK_DATA) {
      const allFiltered = filterReviews(MOCK_REVIEWS, { activeTab, minRating, search: debouncedSearch, from, to })
      const total = allFiltered.length
      const totalPages = Math.ceil(total / PAGE_LIMIT) || 1
      const clampedPage = Math.min(Math.max(page, 1), totalPages)
      const start = (clampedPage - 1) * PAGE_LIMIT
      const paginatedData = allFiltered.slice(start, start + PAGE_LIMIT)

      setReviews(paginatedData)
      setPagination({ total, page: clampedPage, limit: PAGE_LIMIT, totalPages })
      setCounts(computeStatusCounts(allFiltered))
      setLoading(false)
      return
    }

    if (!outletId || isSessionOutletRemoved) {
      setReviews([])
      setCounts(EMPTY_COUNTS)
      setLoading(false)
      return
    }

    const fetchKey = JSON.stringify({
      outletId,
      page,
      activeTab,
      minRating,
      debouncedSearch,
      from: from ? from.toISOString() : null,
      to: to ? to.toISOString() : null,
    })

    if (lastFetchKeyRef.current === fetchKey) {
      return
    }
    lastFetchKeyRef.current = fetchKey

    let cancelled = false
    setLoading(true)

    const params = {
      outletId,
      page,
      limit: PAGE_LIMIT,
      sort: 'date_desc',
    }
    if (activeTab !== 'all') params.status = STATUS_API_MAP[activeTab]
    if (minRating) params.rating = RATING_API_MAP[minRating]
    if (debouncedSearch) params.search = debouncedSearch
    if (from) params.from = from.toISOString()
    if (to) params.to = to.toISOString()

    fetchReviews(params)
      .then((res) => {
        if (cancelled) return

        const total = res?.totalReviews ?? res?.pagination?.total ?? (Array.isArray(res?.data) ? res.data.length : 0)
        const totalPages = res?.totalPages ?? res?.pagination?.totalPages ?? (Math.ceil(total / PAGE_LIMIT) || 1)
        const currentPage = res?.currentPage ?? res?.pagination?.page ?? page

        // Update sessionStorage count cache
        if (typeof total === 'number' && total >= 0) {
          setCachedReviewCount(outletId, total)
        }

        // Clamp the page if filters reduce result set below current page
        if (page > 1 && totalPages > 0 && page > totalPages) {
          setPage(totalPages)
          return
        }

        const items = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res.slice(0, PAGE_LIMIT) : [])

        setReviews(items)
        setPagination({ total, page: currentPage, limit: PAGE_LIMIT, totalPages })
        setCounts({ ...EMPTY_COUNTS, ...(res?.counts || {}) })

        if (selectedReviewRef.current) {
          const updated = items.find((r) => r.id === selectedReviewRef.current.id)
          if (updated) setSelectedReview(updated)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[OutletReviews] REST API fetch failed:', err?.message)
        // Reset key so user/retry can re-attempt if network drops
        lastFetchKeyRef.current = ''
        setReviews([])
        setCounts(EMPTY_COUNTS)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [outletId, isSessionOutletRemoved, page, activeTab, minRating, debouncedSearch, from, to])

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

  const handlePresetChange = (val) => {
    setDatePreset(val)
    setPage(1)
  }

  const handleApplyCustom = () => {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setAppliedCustom({ start: customStart, end: customEnd })
    setPage(1)
  }

  const handleClearDateFilter = () => {
    setDatePreset('all')
    setCustomStart('')
    setCustomEnd('')
    setAppliedCustom(null)
    setPage(1)
  }

  const resetAllFilters = () => {
    setSearchQuery('')
    setDebouncedSearch('')
    setActiveTab('all')
    setMinRating(0)
    handleClearDateFilter()
  }

  const hasActiveFilters =
    isDateFilterActive || activeTab !== 'all' || minRating !== 0 || Boolean(debouncedSearch)

  return (
    <div className="space-y-5 relative">
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

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slatey-200 bg-white/80 px-3 py-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-slatey-400" />
        <select
          value={datePreset}
          onChange={(e) => handlePresetChange(e.target.value)}
          className="rounded-lg border border-slatey-200 bg-white/80 px-2.5 py-1.5 text-sm text-slatey-700 outline-none focus:border-brand-400"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>

        {datePreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slatey-200 bg-white/80 px-2.5 py-1.5 text-sm text-slatey-700 outline-none focus:border-brand-400"
            />
            <span className="text-xs text-slatey-400">→</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slatey-200 bg-white/80 px-2.5 py-1.5 text-sm text-slatey-700 outline-none focus:border-brand-400"
            />
            <Button
              variant="outline"
              size="sm"
              className="text-xs font-semibold"
              disabled={!customStart || !customEnd || customStart > customEnd}
              onClick={handleApplyCustom}
            >
              Apply
            </Button>
            {customStart && customEnd && customStart > customEnd && (
              <span className="text-[11px] font-medium text-rose-600">End date must be on or after start date</span>
            )}
          </div>
        )}

        {isDateFilterActive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700">
            {formatRangeLabel(from, to)}
          </span>
        )}

        {isDateFilterActive && (
          <button
            type="button"
            onClick={handleClearDateFilter}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slatey-500 transition hover:text-slatey-800"
          >
            <RotateCcw className="h-3 w-3" /> Clear
          </button>
        )}

        <span className="ml-auto hidden text-[11px] font-medium text-slatey-400 sm:inline">
          Sorted: newest first
        </span>
      </div>

      {/* Tabs */}
      <div className="flex max-w-full overflow-x-auto whitespace-nowrap gap-1 rounded-xl border border-slatey-200 bg-slatey-50/80 p-1">
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
              <ReviewCard key={review.id} review={review} onSelect={setSelectedReview} />
            ))}
          </motion.div>
        ) : (
          <EmptyState
            title={hasActiveFilters ? 'No reviews match your filters' : 'No reviews yet'}
            description={
              hasActiveFilters
                ? 'Try widening the date range or clearing your filters.'
                : 'Waiting for the first sync. New reviews will appear automatically.'
            }
            actionLabel={hasActiveFilters ? 'Clear filters' : undefined}
            onAction={hasActiveFilters ? resetAllFilters : undefined}
          />
        )}
      </AnimatePresence>

      {/* Details Side Drawer */}
      <AnimatePresence>
        {selectedReview && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.4 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedReview(null)}
              className="fixed inset-0 z-40 bg-slatey-900/60"
            />
            {/* Drawer */}
            <ReviewDetailsDrawer
              review={selectedReview}
              onClose={() => setSelectedReview(null)}
            />
          </>
        )}
      </AnimatePresence>

      {/* Pagination Controls */}
      {!loading && reviews.length > 0 && pagination.total > 50 && pagination.totalPages > 1 && (
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
