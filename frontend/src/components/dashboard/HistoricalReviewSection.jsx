import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { History, Sparkles, MessageCircle, CheckCircle2, Clock, AlertTriangle, ChevronRight } from 'lucide-react'
import { formatTimestamp } from '../../utils/format'
import StatusBadge from '../feedback/StatusBadge'
import Skeleton from '../feedback/Skeleton'
import apiClient from '../../services/apiClient'

export default function HistoricalReviewSection({ outletId }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('imported10')

  useEffect(() => {
    if (!outletId) {
      setLoading(true)
      return
    }

    setLoading(true)
    apiClient
      .get(`/api/outlets/historical-summary?outletId=${outletId}`)
      .then((res) => {
        setData(res.data)
      })
      .catch((err) => {
        console.warn('[HistoricalReviewSection] Failed to load historical summary:', err?.message)
      })
      .finally(() => {
        setLoading(false)
      })
  }, [outletId])

  if (loading) {
    return (
      <div className="rounded-3xl border border-slatey-200 bg-white p-6 shadow-sm dark:border-slatey-800 dark:bg-slatey-900">
        <Skeleton className="h-8 w-48 mb-4" />
        <div className="grid gap-4 sm:grid-cols-3 mb-6">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!data) return null

  const { onboardingReviewCount, latest10Imported = [], latest30ExistingResponses = [], statusCounts = {} } = data

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="rounded-3xl border border-slatey-200 bg-white p-6 shadow-sm dark:border-slatey-800 dark:bg-slatey-900"
    >
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-slatey-100 dark:border-slatey-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slatey-900 dark:text-white">
              Historical Review & Context Baseline
            </h3>
            <p className="text-xs text-slatey-500">
              Preserved onboarding history, AI context records, and baseline review tracking.
            </p>
          </div>
        </div>
      </div>

      {/* Overview Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-5">
        <div className="rounded-2xl border border-slatey-150 bg-slatey-50/70 p-4 dark:border-slatey-800 dark:bg-slatey-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-slatey-400">GMB Baseline</p>
          <p className="mt-1 text-2xl font-bold text-slatey-900 dark:text-white">
            {onboardingReviewCount || statusCounts.totalOnboarding || 0}
          </p>
          <p className="mt-1 text-[11px] text-slatey-500">Total GMB reviews at onboarding</p>
        </div>

        <div className="rounded-2xl border border-slatey-150 bg-slatey-50/70 p-4 dark:border-slatey-800 dark:bg-slatey-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-slatey-400">Latest 10 Onboarded</p>
          <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
            {latest10Imported.length}
          </p>
          <p className="mt-1 text-[11px] text-slatey-500">Initial AI response targets</p>
        </div>

        <div className="rounded-2xl border border-slatey-150 bg-slatey-50/70 p-4 dark:border-slatey-800 dark:bg-slatey-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-slatey-400">Existing Context</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {latest30ExistingResponses.length}
          </p>
          <p className="mt-1 text-[11px] text-slatey-500">Pre-existing GMB responses stored</p>
        </div>

        <div className="rounded-2xl border border-slatey-150 bg-slatey-50/70 p-4 dark:border-slatey-800 dark:bg-slatey-800/40">
          <p className="text-xs font-semibold uppercase tracking-wider text-slatey-400">Metadata Only</p>
          <p className="mt-1 text-2xl font-bold text-purple-600 dark:text-purple-400">
            {Math.max(0, (onboardingReviewCount || 0) - latest10Imported.length - latest30ExistingResponses.length)}
          </p>
          <p className="mt-1 text-[11px] text-slatey-500">Older reviews (zero extra AI cost)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 border-b border-slatey-150 pb-2 dark:border-slatey-800">
        <button
          onClick={() => setActiveTab('imported10')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'imported10'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slatey-600 hover:bg-slatey-100 dark:text-slatey-400 dark:hover:bg-slatey-800'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Latest 10 Onboarding Reviews ({latest10Imported.length})
        </button>

        <button
          onClick={() => setActiveTab('existing30')}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === 'existing30'
              ? 'bg-brand-600 text-white shadow-sm'
              : 'text-slatey-600 hover:bg-slatey-100 dark:text-slatey-400 dark:hover:bg-slatey-800'
          }`}
        >
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
          Existing GMB Responses ({latest30ExistingResponses.length})
        </button>
      </div>

      {/* Tab Content List */}
      <div className="mt-4">
        {activeTab === 'imported10' && (
          <div className="space-y-3">
            {latest10Imported.length > 0 ? (
              latest10Imported.map((item) => (
                <div
                  key={item.id || item.reviewId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slatey-150 bg-white p-4 shadow-2xs dark:border-slatey-800 dark:bg-slatey-950"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slatey-900 dark:text-white">
                        {item.customerName || 'Customer'}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        {item.rating} ★
                      </span>
                      <span className="text-xs text-slatey-400">
                        {formatTimestamp(item.reviewTimestamp || item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slatey-600 dark:text-slatey-400 line-clamp-2">
                      "{item.text || 'No review comment'}"
                    </p>
                    {item.aiResponse && (
                      <p className="text-[11px] text-brand-700 bg-brand-50 p-2 rounded-lg mt-1 dark:bg-brand-500/10 dark:text-brand-300">
                        ✨ <strong>AI Reply:</strong> {item.aiResponse}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-full bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-700 border border-purple-200 dark:bg-purple-500/10 dark:text-purple-300 dark:border-purple-500/20">
                      Imported / Historical
                    </span>
                    <StatusBadge status={item.status} />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slatey-400 italic p-4 text-center">No onboarding reviews recorded yet.</p>
            )}
          </div>
        )}

        {activeTab === 'existing30' && (
          <div className="space-y-3">
            {latest30ExistingResponses.length > 0 ? (
              latest30ExistingResponses.map((item) => (
                <div
                  key={item.id || item.reviewId}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-slatey-150 bg-white p-4 shadow-2xs dark:border-slatey-800 dark:bg-slatey-950"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-slatey-900 dark:text-white">
                        {item.customerName || 'Customer'}
                      </span>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        {item.rating} ★
                      </span>
                      <span className="text-xs text-slatey-400">
                        {formatTimestamp(item.reviewTimestamp || item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slatey-600 dark:text-slatey-400 line-clamp-2">
                      "{item.text || 'No review comment'}"
                    </p>
                    {item.aiResponse && (
                      <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-lg mt-1 dark:bg-emerald-500/10 dark:text-emerald-300">
                        💬 <strong>GMB Reply Context:</strong> {item.aiResponse}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/20">
                      Existing GMB Response
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-slatey-400 italic p-4 text-center">No pre-existing GMB responses found during onboarding.</p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
