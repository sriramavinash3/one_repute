import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Clock, CheckCircle2, MessageSquare, Star, ChevronDown, ChevronRight, ShieldAlert, Store, ArrowRight } from 'lucide-react'
import { Card } from '../../components/ui/card'
import StatusBadge from '../../components/feedback/StatusBadge'
import Button from '../../components/ui/button'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { fetchEscalations } from '../../services/reviewService'
import { fetchAdminOutlets } from '../../services/outletService'
import { formatTimestamp } from '../../utils/format'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

function EscalationRow({ item: escalation }) {
  const [expanded, setExpanded] = useState(false)
  const isCritical = escalation.rating === 1

  return (
    <motion.div
      variants={item}
      layout
      className={`rounded-2xl border transition-all duration-300 ${
        isCritical 
          ? 'border-rose-100 bg-rose-50/30 dark:border-rose-900/30 dark:bg-rose-500/5' 
          : 'border-slatey-100 bg-white dark:border-slatey-800 dark:bg-slatey-900/40'
      } ${expanded ? 'ring-2 ring-brand-100 dark:ring-brand-900/50' : ''}`}
    >
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
              isCritical ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}>
              {isCritical ? <ShieldAlert className="h-6 w-6" /> : <AlertCircle className="h-6 w-6" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slatey-900 dark:text-slatey-100">{escalation.customerName}</p>
                <span className="text-slatey-300 dark:text-slatey-700">·</span>
                <div className="flex items-center gap-1 text-xs font-medium text-slatey-500 dark:text-slatey-400">
                  <Store className="h-3.5 w-3.5" />
                  {escalation.outletName}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slatey-400">
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map(n => (
                    <Star key={n} className={`h-3 w-3 ${n <= escalation.rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-100'}`} />
                  ))}
                </div>
                <span>·</span>
                <Clock className="h-3 w-3" />
                <span>{escalation.date}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={escalation.status} />
            <button 
              onClick={() => setExpanded(!expanded)}
              className="rounded-lg p-2 text-slatey-400 hover:bg-slatey-100 hover:text-slatey-700 transition-colors"
            >
              {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="mt-4 pl-14">
          <p className="text-sm text-slatey-700 leading-relaxed italic border-l-2 border-slatey-100 pl-4 dark:text-slatey-300 dark:border-slatey-800">
            "{escalation.text}"
          </p>
        </div>

        <div className="mt-4 pl-14 flex flex-wrap items-center gap-3">
          {escalation.whatsappSent ? (
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              WhatsApp Alert Sent to {escalation.managerContacted}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-full bg-slatey-100 px-3 py-1 text-[11px] font-semibold text-slatey-500 dark:bg-slatey-800 dark:text-slatey-400">
              <Clock className="h-3 w-3" />
              Queued for WhatsApp Dispatch
            </div>
          )}
          <Button variant="ghost" size="sm" className="h-7 text-brand-600 px-2 dark:text-brand-400">
            View Outlet Profile <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden bg-slatey-50/50 border-t border-slatey-100"
          >
            <div className="p-6 pl-20">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slatey-400">AI Proposed Resolution</label>
                  <div className="mt-2 rounded-xl border border-brand-100 bg-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <MessageSquare className="mt-0.5 h-4 w-4 text-brand-500" />
                      <p className="text-sm text-slatey-600 leading-relaxed">{escalation.aiSuggestion}</p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="bg-brand-600 shadow-brand">Approve and Post</Button>
                  <Button size="sm" variant="outline">Edit Response</Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function AdminEscalationsPage() {
  const { data: escalations = [], isLoading } = useQuery({
    queryKey: ['admin-escalations'],
    queryFn: () => fetchEscalations({ limit: 200 })
  })

  const { data: outletPayload } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: fetchAdminOutlets
  })

  const outletMap = useMemo(() => {
    const list = outletPayload?.outlets || []
    return new Map(list.map((outlet) => [outlet.id, outlet]))
  }, [outletPayload])

  const normalized = useMemo(() => {
    return escalations.map((item) => ({
      ...item,
      outletName: outletMap.get(item.outletId)?.name || 'Unknown Outlet',
      aiSuggestion: item.replySuggestion || item.aiResponse || null,
      whatsappSent: Boolean(item.alertSentAt || item.managerNotified),
      date: formatTimestamp(item.reviewTimestamp || item.createdAt)
    }))
  }, [escalations, outletMap])

  const criticalCount = normalized.filter((esc) => Number(esc.rating) === 1).length
  const suggestedCount = normalized.filter((esc) => Boolean(esc.aiSuggestion)).length

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Global Escalations</h2>
          <p className="text-sm text-slatey-500">Managing {normalized.length} high-priority customer issues across the network.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="bg-white">
            <ShieldAlert className="mr-2 h-4 w-4 text-rose-500" />
            Critical Only
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-4 border-none shadow-glow bg-white dark:bg-slatey-900/40 border-l-4 border-rose-500">
          <p className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Unresolved Critical</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-bold text-slatey-900 dark:text-slatey-100">{criticalCount}</p>
            <span className="text-[10px] font-medium text-rose-500 mb-1">Current</span>
          </div>
        </Card>
        <Card className="p-4 border-none shadow-glow bg-white dark:bg-slatey-900/40 border-l-4 border-amber-500">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Escalations</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-bold text-slatey-900 dark:text-slatey-100">{normalized.length}</p>
            <span className="text-[10px] font-medium text-amber-500 mb-1">Current</span>
          </div>
        </Card>
        <Card className="p-4 border-none shadow-glow bg-white dark:bg-slatey-900/40 border-l-4 border-brand-500">
          <p className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">AI Suggestions</p>
          <div className="mt-2 flex items-end justify-between">
            <p className="text-3xl font-bold text-slatey-900 dark:text-slatey-100">{suggestedCount}</p>
            <span className="text-[10px] font-medium text-brand-500 mb-1">Ready</span>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : normalized.length > 0 ? (
          normalized.map((esc) => (
            <EscalationRow key={esc.id} item={esc} />
          ))
        ) : (
          <EmptyState
            title="No escalations yet"
            description="Escalated reviews will appear here after sync."
          />
        )}
      </div>
    </motion.div>
  )
}
