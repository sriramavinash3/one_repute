import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Clock, CheckCircle2, MessageSquare, Star, ChevronDown, ChevronRight, Phone } from 'lucide-react'
import StatusBadge from '../../components/feedback/StatusBadge'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore'
import { db } from '../../firebase/firebase'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_REVIEWS } from '../../config/mockData'
import { useAuth } from '../../contexts/AuthContext'
import { formatTimestamp } from '../../utils/format'

const PRIORITY_COLORS = {
  1: 'bg-red-100 text-red-700 border-red-200',
  2: 'bg-orange-100 text-orange-700 border-orange-200',
  3: 'bg-amber-100 text-amber-700 border-amber-200',
}

function EscalationCard({ item }) {
  const [expanded, setExpanded] = useState(false)

  const priorityLabel = item.rating === 1 ? 'Critical' : item.rating === 2 ? 'High' : 'Medium'
  const priorityClass = PRIORITY_COLORS[item.rating] || PRIORITY_COLORS[3]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-slatey-200 bg-white/80 shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-start gap-4 p-5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          item.rating <= 2 ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'
        }`}>
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slatey-900">{item.customerName}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityClass}`}>
              {priorityLabel}
            </span>
            <StatusBadge status={item.status} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slatey-400">
            <div className="flex items-center gap-0.5">
              {[1,2,3,4,5].map((n) => (
                <Star key={n} className={`h-3 w-3 ${n <= item.rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-200'}`} />
              ))}
            </div>
            <span>·</span>
            <Clock className="h-3 w-3" />
            <span>{item.date}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slatey-600">{item.text}</p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 rounded-lg p-1.5 text-slatey-400 transition hover:bg-slatey-100 hover:text-slatey-700"
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {/* WhatsApp status row */}
      <div className={`flex items-center gap-3 border-t px-5 py-3 text-xs ${
        item.whatsappSent
          ? 'border-emerald-100 bg-emerald-50/60 text-emerald-700'
          : 'border-slatey-100 bg-slatey-50/60 text-slatey-500'
      }`}>
        <Phone className="h-3.5 w-3.5 shrink-0" />
        {item.whatsappSent
          ? `WhatsApp alert sent to manager · ${item.whatsappTime}`
          : 'WhatsApp alert pending: will send on next cron run'}
      </div>

      {/* Expanded: AI suggestion */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="border-t border-slatey-100 p-5">
              {item.aiSuggestion ? (
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slatey-400">AI-suggested response</p>
                  <p className="mt-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-xs leading-relaxed text-slatey-700">
                    {item.aiSuggestion}
                  </p>
                  <p className="mt-2 text-[11px] text-slatey-400">
                    This suggestion was sent to the outlet manager via WhatsApp for manual approval before posting.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slatey-400 italic">
                  AI suggestion not yet generated: pending next processing run.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function OutletEscalationsPage() {
  const [filter, setFilter] = useState('all')
  const { outlet, profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const outletId = outlet?.id || profile?.outletId
  const escalationThreshold = Number(outlet?.escalationThreshold || 3)

  useEffect(() => {
    if (USE_MOCK_DATA) {
      setItems(MOCK_REVIEWS.filter(r => r.status === 'escalated'))
      setLoading(false)
      return
    }

    if (!outletId) {
      setItems([])
      setLoading(false)
      return
    }

    setLoading(true)
    const q = query(
      collection(db, 'reviews'),
      where('outletId', '==', outletId),
      where('status', '==', 'escalated'),
      orderBy('createdAt', 'desc'),
      limit(100)
    )

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        console.debug('[Escalations] snapshot size:', snap.size)
        const data = snap.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          date: formatTimestamp(doc.data()?.reviewTimestamp || doc.data()?.createdAt),
          whatsappSent: Boolean(doc.data()?.alertSentAt || doc.data()?.managerNotified),
          whatsappTime: formatTimestamp(doc.data()?.alertSentAt),
          aiSuggestion: doc.data()?.replySuggestion || doc.data()?.aiResponse || null
        }))
        console.debug('[Escalations] items:', data)
        setItems(data)
        setLoading(false)
      },
      (err) => {
        console.error('[Escalations] snapshot error', err)
        setItems([])
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [outletId])

  const filtered = useMemo(() => items.filter((e) => {
    if (filter === 'critical') return e.rating === 1
    if (filter === 'pending') return e.status === 'pending'
    if (filter === 'escalated') return e.status === 'escalated'
    return true
  }), [items, filter])

  const criticalCount = items.filter(e => e.rating === 1).length

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Escalations</h2>
          <p className="text-sm text-slatey-500">Negative reviews escalated to WhatsApp for manual intervention.</p>
        </div>
        {criticalCount > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700">
            <AlertCircle className="h-4 w-4" />
            {criticalCount} critical review{criticalCount > 1 ? 's' : ''} need attention
          </div>
        )}
      </div>

      {/* How it works banner */}
      <div className="rounded-xl border border-brand-100 bg-brand-50/60 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-600">How escalations work</p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slatey-600">
          <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">1</span>Review with rating ≤ {escalationThreshold} is detected</span>
          <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">2</span>WhatsApp alert sent to manager with suggestion</span>
          <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-600">3</span>Manager reviews and approves manually</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 rounded-xl border border-slatey-200 bg-slatey-50/80 p-1 w-fit">
        {[
          { key: 'all', label: `All (${items.length})` },
          { key: 'critical', label: `Critical (${criticalCount})` },
          { key: 'escalated', label: 'Escalated' },
          { key: 'pending', label: 'Pending' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              filter === t.key ? 'bg-white text-brand-700 shadow-sm' : 'text-slatey-500 hover:text-slatey-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Escalation Cards */}
      <div className="grid gap-4">
        <AnimatePresence mode="popLayout">
          {loading ? (
            <div className="grid gap-4">
              {Array.from({ length: 2 }).map((_, index) => (
                <Skeleton key={index} className="h-28 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            filtered.map((item) => (
              <EscalationCard key={item.id} item={item} />
            ))
          ) : (
            <EmptyState
              title="No escalations"
              description="Escalated reviews will appear here after sync."
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
