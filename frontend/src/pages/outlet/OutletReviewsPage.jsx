import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Star, MessageSquare, Sparkles, Filter, ClipboardCopy, Check, ExternalLink, X, Clock, AlertTriangle, CheckCircle, Mail, Phone, Lock } from 'lucide-react'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { useAuth } from '../../contexts/AuthContext'
import { formatTimestamp } from '../../utils/format'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import Button from '../../components/ui/button'
import useAppStore from '../../store/appStore'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_REVIEWS } from '../../config/mockData'
import apiClient from '../../services/apiClient'
import { fetchReviewEscalationStatus } from '../../services/escalationService'
import { useSubscription } from '../../contexts/SubscriptionContext'
import { toast } from 'sonner'

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
  const { hasFeature } = useSubscription()
  const approvalMode = hasFeature('reply_approval_mode')
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

  const handleMarkResponded = async (e) => {
    e.stopPropagation()
    try {
      await apiClient.patch(`/api/outlets/reviews/${review.id}/status`, { status: 'responded' })
    } catch (err) {
      console.error('Failed to mark as responded', err)
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
              {(review.status === 'suggested' || review.status === 'pending') && (
                approvalMode ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await apiClient.post(`/api/approvals/${review.id}/approve`)
                          toast.success('Reply approved and posted!')
                        } catch (err) {
                          toast.error('Failed to approve reply')
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <Check className="h-3 w-3" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation()
                        try {
                          await apiClient.post(`/api/approvals/${review.id}/reject`)
                          toast.success('Reply suggestion rejected')
                        } catch (err) {
                          toast.error('Failed to reject reply')
                        }
                      }}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100"
                    >
                      <X className="h-3 w-3" /> Reject
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleMarkResponded}
                    className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100 hover:border-emerald-300"
                  >
                    <Check className="h-3.5 w-3.5" />
                    Mark as Responded
                  </button>
                )
              )}
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

function ReviewDetailsDrawer({ review, onClose }) {
  const [timeline, setTimeline] = useState([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)
  const [copied, setCopied] = useState(false)

  const aiResponse = review.aiResponse || review.replySuggestion || ''

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
              <h4 className="text-xs font-bold text-slatey-500 uppercase tracking-wider">AI suggested Reply</h4>
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
  const [activeTab, setActiveTab] = useState('all')
  const [minRating, setMinRating] = useState(0)
  const { outlet, profile } = useAuth()
  const [reviews, setReviews] = useState([])
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 })
  const [counts, setCounts] = useState({ all: 0, pending: 0, suggested: 0, responded: 0, escalated: 0, failed: 0 })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [selectedReview, setSelectedReview] = useState(null)

  const outletId = outlet?.id || profile?.outletId

  useEffect(() => {
    if (USE_MOCK_DATA) {
      setReviews(MOCK_REVIEWS)
      setLoading(false)
      return
    }

    if (!outletId) {
      setReviews([])
      setLoading(false)
      return
    }

    // Defence-in-depth: if the session outlet has been removed, do not subscribe to its reviews
    if (outlet?.status === 'removed' || outlet?.isDeleted === true) {
      setReviews([])
      setLoading(false)
      return
    }

    setLoading(true)
    let q = query(
      collection(db, 'reviews'),
      where('outletId', '==', outletId),
      orderBy('createdAt', 'desc'),
      limit(100)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))

        // Tab/status filter
        if (activeTab !== 'all') {
          if (activeTab === 'escalated') {
            // Include both legacy escalated and new levels
            data = data.filter((r) => r.status === 'escalated' || (r.escalationStatus && r.escalationStatus !== 'no_escalation' && r.escalationStatus !== 'resolved'))
          } else {
            data = data.filter((r) => (r.status || 'pending') === activeTab)
          }
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
          if (r.escalationStatus && r.escalationStatus !== 'no_escalation' && r.escalationStatus !== 'resolved') {
            counts.escalated++
          }
          counts.all++
        })
        setCounts(counts)
        setLoading(false)

        // Sync currently opened drawer review details if it updates
        if (selectedReview) {
          const updated = data.find(r => r.id === selectedReview.id)
          if (updated) setSelectedReview(updated)
        }
      },
      () => {
        setReviews([])
        setLoading(false)
      }
    )
    return () => unsubscribe()
  }, [outletId, outlet?.status, outlet?.isDeleted, activeTab, minRating, searchQuery])


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
            title="No reviews yet"
            description="Waiting for the first sync. New reviews will appear automatically."
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
