import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Clock, CheckCircle2, MessageSquare, Star, ChevronDown, ChevronRight, ShieldAlert, Store, ArrowRight, Search } from 'lucide-react'
import { Card } from '../../components/ui/card'
import StatusBadge from '../../components/feedback/StatusBadge'
import Button from '../../components/ui/button'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { fetchEscalations } from '../../services/reviewService'
import { fetchAdminOutlets } from '../../services/outletService'
import { fetchAdminCustomers, normalizeCustomers } from '../../services/adminService'
import { USE_MOCK_DATA } from '../../config/env'
import { MOCK_CUSTOMERS, MOCK_ESCALATIONS, MOCK_OUTLETS } from '../../config/mockData'
import { formatTimestamp } from '../../utils/format'
import { Link } from 'react-router-dom'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.1 } }
}

const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 }
}

export default function AdminEscalationsPage() {
  const [query, setQuery] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [issueFilter, setIssueFilter] = useState('all')
  const [whatsappFilter, setWhatsappFilter] = useState('all')

  const { data: escalations = [], isLoading } = useQuery({
    queryKey: ['admin-escalations'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_ESCALATIONS;
      return fetchEscalations({ limit: 500 })
    }
  })

  const { data: outletPayload } = useQuery({
    queryKey: ['admin-outlets'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return { outlets: MOCK_OUTLETS, total: MOCK_OUTLETS.length }
      return fetchAdminOutlets()
    }
  })

  const { data: rawCustomers } = useQuery({
    queryKey: ['admin-customers'],
    queryFn: async () => {
      if (USE_MOCK_DATA) return MOCK_CUSTOMERS;
      return fetchAdminCustomers()
    }
  })

  const customers = useMemo(() => {
    return normalizeCustomers(rawCustomers)
  }, [rawCustomers])

  const outletMap = useMemo(() => {
    const list = outletPayload?.outlets || []
    return new Map(list.map((outlet) => [outlet.id, outlet]))
  }, [outletPayload])

  const issueTypes = useMemo(() => {
    const set = new Set()
    escalations.forEach(e => set.add(e.issueCategory || 'Unknown'))
    return Array.from(set).sort()
  }, [escalations])

  const normalized = useMemo(() => {
    return escalations.map((item) => ({
      ...item,
      outletName: outletMap.get(item.outletId)?.name || 'Unknown Outlet',
      aiSuggestion: item.replySuggestion || item.aiResponse || null,
      whatsappSent: Boolean(item.alertSentAt || item.managerNotified),
      date: formatTimestamp(item.reviewTimestamp || item.createdAt)
    }))
  }, [escalations, outletMap])

  const filtered = useMemo(() => {
    return normalized.filter(esc => {
      const outlet = outletMap.get(esc.outletId) || {}
      const customer = customers.find(c => c.id === outlet.customerId) || {}
      
      const searchMatch = esc.text?.toLowerCase().includes(query.toLowerCase()) || 
                       customer.name?.toLowerCase().includes(query.toLowerCase()) ||
                       outlet.name?.toLowerCase().includes(query.toLowerCase())

      let dateMatch = true
      if (dateFilter !== 'all') {
        const ts = (esc.reviewTimestamp || esc.createdAt)?.seconds * 1000 || Date.now()
        const now = Date.now()
        const days = parseInt(dateFilter)
        dateMatch = now - ts <= days * 86400000
      }

      const statMatch = statusFilter === 'all' || esc.status === statusFilter
      const sevMatch = severityFilter === 'all' || (severityFilter === 'high' ? esc.rating === 1 : esc.rating > 1)
      const issMatch = issueFilter === 'all' || esc.issueCategory === issueFilter
      const waMatch = whatsappFilter === 'all' || (whatsappFilter === 'sent' ? esc.whatsappSent : !esc.whatsappSent)

      return searchMatch && dateMatch && statMatch && sevMatch && issMatch && waMatch
    })
  }, [normalized, query, dateFilter, statusFilter, severityFilter, issueFilter, whatsappFilter, outletMap, customers])

  const criticalCount = normalized.filter((esc) => Number(esc.rating) === 1 && esc.status !== 'resolved').length
  const suggestedCount = normalized.filter((esc) => Boolean(esc.aiSuggestion)).length

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900">Global Escalations</h2>
          <p className="text-sm text-slatey-500">Managing {normalized.length} high-priority customer issues across the network.</p>
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

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 min-w-[280px] items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 transition-all">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none"
              placeholder="Search by customer, outlet, or content..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            >
              <option value="all">All Dates</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="Open">Open</option>
              <option value="resolved">Resolved</option>
            </select>
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
            >
              <option value="all">All Severities</option>
              <option value="high">High Severity (1★)</option>
              <option value="medium">Medium Severity (2★)</option>
            </select>
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={issueFilter}
              onChange={(e) => setIssueFilter(e.target.value)}
            >
              <option value="all">All Issues</option>
              {issueTypes.map(iss => <option key={iss} value={iss}>{iss}</option>)}
            </select>
            <select 
              className="rounded-xl border border-slatey-200 bg-white px-3 py-2 text-xs font-medium text-slatey-600 outline-none focus:border-brand-400"
              value={whatsappFilter}
              onChange={(e) => setWhatsappFilter(e.target.value)}
            >
              <option value="all">All WhatsApp</option>
              <option value="sent">Alert Sent</option>
              <option value="failed">Alert Failed/Pending</option>
            </select>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        {isLoading ? (
          <div className="grid gap-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-28 w-full" />
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm whitespace-nowrap">
              <thead className="bg-slatey-50/80 text-xs font-medium uppercase tracking-wider text-slatey-500 dark:bg-slatey-900 dark:text-slatey-400">
                <tr>
                  <th className="px-4 py-3">Customer & Outlet</th>
                  <th className="px-4 py-3">Rating & Content</th>
                  <th className="px-4 py-3">Timestamp & Platform</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slatey-100 dark:divide-slatey-800/50">
                <AnimatePresence mode="popLayout">
                  {filtered.map((esc) => {
                    const outlet = outletMap.get(esc.outletId) || {}
                    const customer = customers.find(c => c.id === outlet.customerId) || {}
                    return (
                      <motion.tr
                        key={esc.id}
                        variants={item}
                        layout
                        className={`group transition-colors ${esc.rating === 1 ? 'bg-rose-50/30 dark:bg-rose-500/5' : 'hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slatey-900 dark:text-slatey-100">{customer.name || 'Unknown'}</span>
                            <span className="text-xs text-brand-600 dark:text-brand-400 mt-0.5">{outlet.name || 'Unknown'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[300px]" title={esc.text}>
                          <div className="flex items-center gap-1 mb-1">
                            {[1,2,3,4,5].map(n => (
                              <Star key={n} className={`h-3 w-3 ${n <= esc.rating ? 'fill-amber-400 text-amber-400' : 'text-slatey-100 dark:text-slatey-800'}`} />
                            ))}
                          </div>
                          <p className="text-xs text-slatey-600 dark:text-slatey-300 truncate mb-1">{esc.text}</p>
                          {esc.aiSuggestion && (
                            <p className="text-[11px] text-slatey-500 italic truncate border-l-2 border-brand-200 pl-1.5 mt-1 bg-slatey-50 p-1 rounded-r">Resp: {esc.aiSuggestion}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="text-xs text-slatey-600 dark:text-slatey-400">
                              {formatTimestamp(esc.reviewTimestamp || esc.createdAt)}
                            </span>
                            <span className="text-[11px] bg-slatey-100 text-slatey-600 px-1.5 py-0.5 rounded mt-1 w-fit">
                              {esc.providerType || 'Google'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1 items-start">
                            <span className="text-[11px] bg-slatey-100 text-slatey-700 px-2 py-0.5 rounded font-medium">
                              {esc.status === 'resolved' ? 'Closed' : esc.whatsappSent ? 'Sent on Whatsapp' : 'Open'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {esc.reviewUrl ? (
                            <a href={esc.reviewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 transition">
                              <ExternalLink className="h-3 w-3" /> View original
                            </a>
                          ) : (
                            <span className="text-xs text-slatey-400">N/A</span>
                          )}
                        </td>
                      </motion.tr>
                    )
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No escalations match criteria"
            description="Try adjusting your filters or search terms."
          />
        )}
      </div>
    </motion.div>
  )
}
