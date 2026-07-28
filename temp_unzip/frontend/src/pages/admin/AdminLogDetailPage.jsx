import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { 
  ChevronLeft, 
  Clock, 
  Database, 
  Terminal, 
  ExternalLink, 
  Info, 
  ShieldCheck, 
  Zap, 
  MessageSquare, 
  AlertTriangle 
} from 'lucide-react'
import { Card } from '../../components/ui/card'
import Button from '../../components/ui/button'
import Badge from '../../components/ui/badge'
import { fetchSystemLogs } from '../../services/adminService'
import { formatTimestamp } from '../../utils/format'

function LogIcon({ type }) {
  const value = String(type || '').toUpperCase()
  if (value.includes('AI') || value.includes('REPLY')) return <MessageSquare className="h-5 w-5 text-emerald-500" />
  if (value.includes('ESCALATED') || value.includes('ALERT')) return <AlertTriangle className="h-5 w-5 text-amber-500" />
  if (value.includes('FAILED') || value.includes('ERROR')) return <AlertTriangle className="h-5 w-5 text-rose-500" />
  if (value.includes('TOKEN') || value.includes('AUTH')) return <ShieldCheck className="h-5 w-5 text-indigo-500" />
  if (value.includes('SYNC') || value.includes('CRON')) return <Zap className="h-5 w-5 text-brand-500" />
  return <Database className="h-5 w-5 text-slatey-500" />
}

export default function AdminLogDetailPage() {
  const { id } = useParams()
  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: fetchSystemLogs
  })

  const logs = data?.logs || []
  

  const log = useMemo(() => logs.find((entry) => entry.id === id), [logs, id])
  
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-slatey-500">Loading log entry...</p>
      </div>
    )
  }
  
  if (!log) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-slatey-500">Log entry not found.</p>
        <Link to="/admin-dashboard/ai-logs" className="mt-4 text-brand-600 font-medium hover:underline">
          Go back to logs
        </Link>
      </div>
    )
  }

  const badgeVariant = log.status === 'success'
    ? 'success'
    : log.status === 'warning'
      ? 'warning'
      : log.status === 'danger' || log.status === 'error'
        ? 'danger'
        : 'neutral'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/admin-dashboard/ai-logs">
          <Button variant="ghost" size="sm" className="rounded-full">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slatey-900 dark:text-slatey-100">{log.eventType || 'System Event'}</h2>
            <Badge variant={badgeVariant}>{log.status || 'unknown'}</Badge>
          </div>
          <p className="text-sm text-slatey-500">Log ID: {log.id} • {formatTimestamp(log.timestamp)}</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 dark:bg-slatey-900/40">
            <div className="flex items-center gap-2 mb-4">
              <Info className="h-4 w-4 text-brand-500" />
              <h3 className="font-semibold text-slatey-800 dark:text-slatey-200">Execution Summary</h3>
            </div>
            <div
              className="text-slatey-600 dark:text-slatey-300 leading-relaxed break-words overflow-wrap break-word max-w-full max-h-48 overflow-auto"
              style={{ wordBreak: 'break-word', overflowWrap: 'break-word' }}
            >
              {log.errorMessage || log.payload?.message || JSON.stringify(log.payload || {})}
            </div>
          </Card>

          <Card className="p-6 dark:bg-slatey-900/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Terminal className="h-4 w-4 text-slatey-400" />
                <h3 className="font-semibold text-slatey-800 dark:text-slatey-200">System Context</h3>
              </div>
            </div>
            <div className="bg-slatey-950 rounded-xl p-4 font-mono text-[11px] text-slatey-300 overflow-x-auto">
              <p className="text-slatey-500 mb-2">// raw_log_output_{log.id}.json</p>
              <pre>{JSON.stringify(log, null, 2)}</pre>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6 dark:bg-slatey-900/40">
            <h3 className="font-semibold text-slatey-800 mb-4 dark:text-slatey-200">Properties</h3>
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slatey-400 mb-1">Type</p>
                <div className="flex items-center gap-2">
                  <LogIcon type={log.eventType} />
                  <span className="text-sm font-medium text-slatey-700 dark:text-slatey-300 capitalize">{log.eventType || 'system'}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slatey-400 mb-1">Status</p>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${
                    log.status === 'success' ? 'bg-emerald-500' : 
                    log.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
                  }`} />
                  <span className="text-sm font-medium text-slatey-700 dark:text-slatey-300 capitalize">{log.status || 'unknown'}</span>
                </div>
              </div>
              {log.payload?.outletId && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slatey-400 mb-1">Related Outlet</p>
                  <Link 
                    to={`/admin-dashboard/outlets/${log.payload.outletId}`}
                    className="flex items-center justify-between group"
                  >
                    <span className="text-sm font-medium text-brand-600 hover:underline">{log.payload.outletId}</span>
                    <ExternalLink className="h-3 w-3 text-slatey-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6 dark:bg-slatey-900/40">
            <h3 className="font-semibold text-slatey-800 mb-4 dark:text-slatey-200">Timeline</h3>
            <div className="space-y-4 relative">
              <div className="absolute left-1.5 top-2 bottom-2 w-px bg-slatey-200 dark:bg-slatey-800" />
              <div className="relative pl-6">
                <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-brand-500 bg-white dark:bg-slatey-900" />
                <p className="text-xs font-semibold text-slatey-800 dark:text-slatey-200">Event Logged</p>
                <p className="text-[10px] text-slatey-400">{formatTimestamp(log.timestamp)}</p>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-0 top-1.5 h-3 w-3 rounded-full border-2 border-slatey-200 bg-white dark:bg-slatey-900 dark:border-slatey-800" />
                <p className="text-xs font-semibold text-slatey-500">Processed</p>
                <p className="text-[10px] text-slatey-400">T + 0.2s</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
