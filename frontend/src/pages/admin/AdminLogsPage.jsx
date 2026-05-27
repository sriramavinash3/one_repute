import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Activity, Zap, ShieldCheck, AlertTriangle, MessageSquare, RefreshCw, Search, Clock, ChevronRight } from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import { useQuery } from '@tanstack/react-query'
import { fetchSystemLogs } from '../../services/adminService'
import EmptyState from '../../components/feedback/EmptyState'
import Skeleton from '../../components/feedback/Skeleton'
import { formatTimestamp } from '../../utils/format'

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
}

const item = {
  hidden: { opacity: 0, x: -10 },
  show: { opacity: 1, x: 0 }
}

function LogIcon({ type }) {
  switch (type) {
    case 'automation': return <Zap className="h-4 w-4 text-brand-500" />
    case 'ai': return <MessageSquare className="h-4 w-4 text-emerald-500" />
    case 'security': return <ShieldCheck className="h-4 w-4 text-indigo-500" />
    case 'alert': return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'error': return <AlertTriangle className="h-4 w-4 text-rose-500" />
    default: return <Activity className="h-4 w-4 text-slatey-500" />
  }
}

export default function AdminLogsPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  // Pagination state
  const [page, setPage] = useState(1)

  const PAGE_SIZE = 25
  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', page],
    queryFn: () => fetchSystemLogs(page, PAGE_SIZE)
  })
  const logs = data?.logs || []
  const total = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const normalizedLogs = useMemo(() => {
    return logs.map((log) => {
      const eventType = log.eventType || 'SYSTEM_EVENT'
      const details = log.errorMessage || log.payload?.message || JSON.stringify(log.payload || {})
      const statusRaw = log.status || 'success'
      const status = statusRaw === 'error' ? 'danger' : statusRaw

      let type = 'automation'
      if (/ERROR|FAILED/i.test(eventType)) type = 'error'
      if (/ESCALATED/i.test(eventType)) type = 'alert'
      if (/AI|REPLY/i.test(eventType)) type = 'ai'
      if (/TOKEN|AUTH/i.test(eventType)) type = 'security'

      return {
        id: log.id,
        type,
        event: eventType,
        details,
        status,
        time: formatTimestamp(log.timestamp)
      }
    })
  }, [logs])

  const filteredLogs = normalizedLogs.filter((log) => {
    const matchesFilter = filter === 'all' || log.status === filter
    const matchesSearch = `${log.event} ${log.details}`.toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <motion.div className="space-y-6" variants={stagger} initial="hidden" animate="show">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slatey-900 dark:text-slatey-100">System Logs</h2>
          <p className="text-sm text-slatey-500 dark:text-slatey-400">Real-time audit trail of all automated system events.</p>
        </div>
        {/* <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="bg-white dark:bg-slatey-800 dark:border-slatey-700 dark:text-slatey-200">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Logs
          </Button>
          <Button size="sm" className="bg-slatey-900 text-white hover:bg-slatey-800 dark:bg-brand-600 dark:hover:bg-brand-700">
            Download Audit Trail
          </Button>
        </div> */}
      </div>

      <Card className="p-4 border-none shadow-glow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-1 min-w-[240px] items-center gap-3 rounded-xl border border-slatey-200 bg-slatey-50/50 px-4 py-2 focus-within:border-brand-400 transition-all dark:border-slatey-800 dark:bg-slatey-900/50">
            <Search className="h-4 w-4 text-slatey-400" />
            <input
              className="w-full bg-transparent text-sm text-slatey-700 outline-none dark:text-slatey-300"
              placeholder="Search events or details..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 rounded-lg border border-slatey-100 bg-slatey-50 p-1 dark:border-slatey-800 dark:bg-slatey-950">
            {['all', 'success', 'warning', 'danger'].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                  filter === s 
                    ? 'bg-white text-brand-600 shadow-sm dark:bg-slatey-800 dark:text-brand-400' 
                    : 'text-slatey-500 hover:text-slatey-700 dark:text-slatey-400 dark:hover:text-slatey-200'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="overflow-hidden rounded-2xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-800 dark:bg-slatey-900/40">
        <div className="divide-y divide-slatey-100 dark:divide-slatey-800">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <Link key={log.id} to={`/admin-dashboard/ai-logs/${log.id}`}>
                <motion.div
                  variants={item}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-slatey-50/50 dark:hover:bg-slatey-800/30 group"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white border border-slatey-100 shadow-sm group-hover:border-brand-100 transition-colors dark:bg-slatey-900 dark:border-slatey-800 dark:group-hover:border-brand-500/50">
                      <LogIcon type={log.type} />
                    </div>
                    <div className="min-w-0 max-w-[320px]">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slatey-900 dark:text-slatey-100 truncate max-w-[180px]">{log.event}</p>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          log.status === 'success' ? 'bg-emerald-500' : 
                          log.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                        }`} />
                      </div>
                      <p className="text-xs text-slatey-500 truncate max-w-[300px] overflow-ellipsis whitespace-nowrap dark:text-slatey-400">{log.details}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 pl-4">
                    <div className="flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1.5 text-[10px] font-medium text-slatey-400">
                        <Clock className="h-3 w-3" />
                        {log.time}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        log.type === 'security' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400' :
                        log.type === 'ai' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' :
                        'bg-slatey-100 text-slatey-600 dark:bg-slatey-800 dark:text-slatey-400'
                      }`}>
                        {log.type}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slatey-300 group-hover:text-slatey-500 transition-colors" />
                  </div>
                </motion.div>
              </Link>
            ))
          ) : (
            <div className="p-6">
              <EmptyState
                title="No logs found"
                description="System activity will appear here as automation runs."
              />
            </div>
          )}
        </div>
      </div>
      
      <div className="flex justify-center items-center gap-2 py-4">
        <Button
          variant="ghost"
          size="sm"
          className="text-slatey-400 px-2"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
        >
          {'<'}
        </Button>
        {Array.from({ length: Math.min(5, totalPages) }).map((_, idx) => {
          let start = Math.max(1, Math.min(page - 2, totalPages - 4))
          const pageNum = start + idx
          if (pageNum > totalPages) return null
          return (
            <Button
              key={pageNum}
              variant={pageNum === page ? 'solid' : 'ghost'}
              size="sm"
              className={`mx-1 ${pageNum === page ? 'bg-brand-600 text-white' : 'text-slatey-400'}`}
              onClick={() => setPage(pageNum)}
              disabled={pageNum < 1}
            >
              {pageNum}
            </Button>
          )
        })}
        <Button
          variant="ghost"
          size="sm"
          className="text-slatey-400 px-2"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page === totalPages}
        >
          {'>'}
        </Button>
      </div>
    </motion.div>
  )
}
