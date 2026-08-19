import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, CheckCircle2, AlertTriangle, RefreshCw, Database } from 'lucide-react'
import Button from '../ui/button'
import { syncBusinessData, fetchSyncStatus } from '../../services/googleAuthService'

const STAGE_PROGRESS = {
  QUEUED: { progress: 15, label: 'Enqueued synchronization job' },
  FETCHING: { progress: 35, label: 'Fetching reviews from Google' },
  PERSISTING: { progress: 65, label: 'Saving reviews into database' },
  ENRICHING: { progress: 90, label: 'Generating AI insights & responses' },
  COMPLETED: { progress: 100, label: 'Finalizing dashboard' },
  SKIPPED: { progress: 100, label: 'Sync completed (cooldown active)' },
  FAILED: { progress: 0, label: 'Synchronization error' },
}

export default function DataSyncModal({ isOpen, outletId, onClose, onSyncComplete }) {
  const [stageKey, setStageKey] = useState('QUEUED')
  const [progress, setProgress] = useState(10)
  const [status, setStatus] = useState('syncing') // 'syncing' | 'completed' | 'error'
  const [errorMessage, setErrorMessage] = useState(null)
  const [countsInfo, setCountsInfo] = useState({ fetched: 0, newCount: 0 })
  const inProgressRef = useRef(false)
  const pollTimerRef = useRef(null)

  const currentStage = STAGE_PROGRESS[stageKey] || STAGE_PROGRESS.QUEUED

  useEffect(() => {
    if (!isOpen || !outletId || inProgressRef.current) return
    runSyncProcess()

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [isOpen, outletId])

  const runSyncProcess = async () => {
    inProgressRef.current = true
    setStatus('syncing')
    setErrorMessage(null)
    setStageKey('QUEUED')
    setProgress(15)

    try {
      const initialResponse = await syncBusinessData(outletId, true)

      if (initialResponse?.status === 'error') {
        throw new Error(initialResponse?.error || 'Failed to fetch Google Business Profile data.')
      }

      // If backend executed synchronously and completed immediately (e.g. inline mode)
      if (initialResponse?.status === 'success' || initialResponse?.status === 'skipped') {
        setCountsInfo({ fetched: initialResponse.fetched || 0, newCount: initialResponse.new || 0 })
        setStageKey('COMPLETED')
        setProgress(100)
        setStatus('completed')
        if (onSyncComplete) await onSyncComplete()
        await new Promise((r) => setTimeout(r, 800))
        inProgressRef.current = false
        if (onClose) onClose()
        return
      }

      const jobId = initialResponse?.jobId
      pollJobStatus(jobId, outletId)
    } catch (err) {
      console.error('[DataSyncModal] Synchronization error:', err)
      inProgressRef.current = false
      setStatus('error')
      setErrorMessage(err?.response?.data?.error || err.message || 'Google Business Profile data could not be synchronized.')
    }
  }

  const pollJobStatus = (jobId, outletId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      try {
        const jobStatus = await fetchSyncStatus(jobId, outletId)
        if (!jobStatus) return

        const stage = jobStatus.stage || jobStatus.status || 'QUEUED'
        setStageKey(stage)

        const stageMeta = STAGE_PROGRESS[stage] || STAGE_PROGRESS.QUEUED
        setProgress(stageMeta.progress)
        setCountsInfo({ fetched: jobStatus.fetchedCount || 0, newCount: jobStatus.newCount || 0 })

        if (stage === 'COMPLETED' || stage === 'SKIPPED') {
          clearInterval(pollTimerRef.current)
          setStatus('completed')
          if (onSyncComplete) await onSyncComplete()
          await new Promise((r) => setTimeout(r, 800))
          inProgressRef.current = false
          if (onClose) onClose()
        } else if (stage === 'FAILED') {
          clearInterval(pollTimerRef.current)
          inProgressRef.current = false
          setStatus('error')
          setErrorMessage(jobStatus.error || 'Review synchronization failed.')
        }
      } catch (err) {
        console.warn('[DataSyncModal] Status polling error:', err?.message)
      }
    }, 800)
  }

  const handleRetry = () => {
    inProgressRef.current = false
    runSyncProcess()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slatey-950/70 p-4 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl dark:bg-slatey-900 border border-slatey-100 dark:border-slatey-800 text-center relative overflow-hidden"
      >
        {/* Background ambient glow */}
        <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-brand-600/10 blur-3xl pointer-events-none" />

        {status === 'syncing' && (
          <div className="relative z-10">
            {/* Animated Spinner Icon */}
            <div className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 dark:bg-brand-950/50 shadow-inner">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
                className="absolute inset-0 rounded-3xl border-2 border-brand-500/20 border-t-brand-600"
              />
              <Sparkles className="h-9 w-9 text-brand-600 dark:text-brand-400" />
            </div>

            {/* Primary & Secondary Copy */}
            <h2 className="text-2xl font-black text-slatey-900 dark:text-white tracking-tight">
              Your data is telling a story.
            </h2>
            <p className="mt-2 text-sm font-medium text-slatey-500 dark:text-slatey-400">
              We&apos;re putting it together.
            </p>

            {/* Progress Bar Container */}
            <div className="mt-8 space-y-3">
              <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-slatey-100 dark:bg-slatey-800 p-0.5">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600 shadow-sm"
                  initial={{ width: '5%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>

              {/* Stage label and percentage indicator */}
              <div className="flex items-center justify-between text-xs font-semibold text-slatey-600 dark:text-slatey-300 px-1">
                <span className="flex items-center gap-1.5 truncate">
                  <Database className="h-3.5 w-3.5 text-brand-500 animate-pulse flex-shrink-0" />
                  {currentStage.label}…
                </span>
                <span className="font-bold text-brand-600 dark:text-brand-400 font-mono">{progress}%</span>
              </div>
              {countsInfo.fetched > 0 && (
                <div className="text-xs text-slatey-400 font-mono">
                  Fetched: {countsInfo.fetched} | New: {countsInfo.newCount}
                </div>
              )}
            </div>
          </div>
        )}

        {status === 'completed' && (
          <div className="relative z-10 py-4">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">
              <CheckCircle2 className="h-10 w-10" />
            </div>
            <h2 className="text-2xl font-bold text-slatey-900 dark:text-white">
              Data Synchronized!
            </h2>
            <p className="mt-2 text-sm text-slatey-500">
              Loading your populated dashboard…
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="relative z-10">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40">
              <AlertTriangle className="h-10 w-10" />
            </div>
            <h2 className="text-xl font-bold text-slatey-900 dark:text-white">
              Synchronization Error
            </h2>
            <p className="mt-2 text-sm text-slatey-600 dark:text-slatey-300">
              Google Business Profile data could not be synchronized.
            </p>
            {errorMessage && (
              <p className="mt-2 text-xs text-rose-600 bg-rose-50 p-2.5 rounded-xl border border-rose-100 truncate">
                {errorMessage}
              </p>
            )}
            <div className="mt-6 flex flex-col gap-2">
              <Button
                size="lg"
                className="w-full h-12 shadow-brand bg-brand-600 text-white hover:bg-brand-700 font-semibold flex items-center justify-center gap-2"
                onClick={handleRetry}
              >
                <RefreshCw className="h-4 w-4" /> Retry Synchronization
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-slatey-500"
                onClick={onClose}
              >
                Skip to Dashboard
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  )
}
