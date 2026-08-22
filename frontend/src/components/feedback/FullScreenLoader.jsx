import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, RefreshCw, AlertCircle, CheckCircle2, Database } from 'lucide-react'
import { useReadiness } from '../../contexts/ReadinessContext'
import Button from '../ui/button'

const STAGES = [
  { key: 'loading', label: 'Loading' },
  { key: 'fetching', label: 'Fetching' },
  { key: 'validating', label: 'Validating' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'ready', label: 'Ready' }
]

const STAGE_INDEX = {
  loading: 0,
  fetching: 1,
  validating: 2,
  rendering: 3,
  ready: 4,
  error: 2,
}

export default function FullScreenLoader({ message, forceShow = false }) {
  const { status, isLoading, stageMessage, retryCount, maxRetries, errorMessage, retry } = useReadiness()

  const active = forceShow || isLoading
  if (!active) return null

  const currentStageIndex = STAGE_INDEX[status] !== undefined ? STAGE_INDEX[status] : 0
  const isError = status === 'error'
  const displayMsg = message || stageMessage || 'Preparing application workspace…'

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slatey-950/70 p-4 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slatey-100 bg-white p-7 text-center shadow-2xl dark:border-slatey-800 dark:bg-slatey-900"
        >
          {/* Ambient Glow */}
          <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-brand-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -right-20 h-40 w-40 rounded-full bg-brand-600/10 blur-3xl" />

          {!isError ? (
            <div className="relative z-10">
              {/* Spinner Icon */}
              <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 shadow-inner dark:bg-brand-950/50">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-2xl border-2 border-brand-500/20 border-t-brand-600"
                />
                <Sparkles className="h-7 w-7 text-brand-600 dark:text-brand-400 animate-pulse" />
              </div>

              {/* Title & Stage message */}
              <h3 className="text-lg font-extrabold text-slatey-900 dark:text-white tracking-tight">
                One Repute Workspace
              </h3>
              <p className="mt-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 min-h-[1.25rem] flex items-center justify-center gap-1.5 px-2">
                <Database className="h-3.5 w-3.5 animate-pulse shrink-0" />
                <span className="truncate">{displayMsg}</span>
              </p>

              {/* Stage Stepper Progress */}
              <div className="mt-6 border-t border-slatey-100 dark:border-slatey-800 pt-5">
                <div className="flex items-center justify-between gap-1 px-1">
                  {STAGES.map((st, idx) => {
                    const isPassed = idx < currentStageIndex
                    const isCurrent = idx === currentStageIndex
                    return (
                      <div key={st.key} className="flex flex-1 flex-col items-center">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${
                            isPassed
                              ? 'bg-emerald-500 text-white'
                              : isCurrent
                              ? 'bg-brand-600 text-white ring-4 ring-brand-100 dark:ring-brand-950/50 scale-110'
                              : 'bg-slatey-100 text-slatey-400 dark:bg-slatey-800'
                          }`}
                        >
                          {isPassed ? <CheckCircle2 className="h-3.5 w-3.5" /> : idx + 1}
                        </div>
                        <span
                          className={`mt-1 text-[10px] font-medium tracking-tight ${
                            isCurrent
                              ? 'font-bold text-slatey-900 dark:text-white'
                              : isPassed
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slatey-400'
                          }`}
                        >
                          {st.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Progress track bar */}
                <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-slatey-100 dark:bg-slatey-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-600"
                    initial={{ width: '10%' }}
                    animate={{ width: `${Math.min(100, (currentStageIndex + 1) * 20)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>

              {retryCount > 0 && (
                <div className="mt-3 text-[11px] font-medium text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                  <RefreshCw className="h-3 w-3 animate-spin" /> Auto re-fetching data (Attempt {retryCount}/{maxRetries})…
                </div>
              )}
            </div>
          ) : (
            /* Error State UI */
            <div className="relative z-10 py-1">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/50">
                <AlertCircle className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slatey-900 dark:text-white">
                Initialization Incomplete
              </h3>
              <p className="mt-1.5 text-xs text-slatey-500 dark:text-slatey-400">
                We could not verify complete data readiness for this page.
              </p>

              {errorMessage && (
                <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50/80 p-3 text-left text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                  <p className="font-semibold">Verification Log:</p>
                  <p className="mt-0.5 font-mono text-[11px] leading-tight break-words">{errorMessage}</p>
                </div>
              )}

              <div className="mt-5 flex flex-col gap-2">
                <Button
                  size="sm"
                  className="w-full h-10 shadow-brand bg-brand-600 text-white hover:bg-brand-700 font-semibold flex items-center justify-center gap-2 text-xs"
                  onClick={retry}
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Retry Initialization
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
