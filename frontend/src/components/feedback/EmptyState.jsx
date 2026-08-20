import { motion } from 'framer-motion'
import { Inbox, RefreshCw, Sparkles, Database } from 'lucide-react'
import Button from '../ui/button'

export default function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  icon: CustomIcon,
  animated = false
}) {
  const isSyncWaiting =
    animated ||
    (title && String(title).toLowerCase().includes('sync')) ||
    (description && String(description).toLowerCase().includes('sync'))

  if (isSyncWaiting) {
    return (
      <div className="relative overflow-hidden rounded-3xl border border-slatey-200 bg-gradient-to-b from-white to-slatey-50/50 px-6 py-12 text-center shadow-xs dark:border-slatey-800 dark:from-slatey-900 dark:to-slatey-950">
        {/* Subtle Ambient Pulsing Glow */}
        <div className="pointer-events-none absolute -top-12 -left-12 h-32 w-32 rounded-full bg-brand-500/10 blur-2xl animate-pulse" />
        <div className="pointer-events-none absolute -bottom-12 -right-12 h-32 w-32 rounded-full bg-brand-600/10 blur-2xl animate-pulse" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Animated Sync Ring Icon */}
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 shadow-inner dark:bg-brand-950/60">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand-400/40 border-t-brand-600"
            />
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <RefreshCw className="h-7 w-7 text-brand-600 dark:text-brand-400" />
            </motion.div>
          </div>

          {/* Live Sync Status Indicator */}
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50/80 px-3 py-1 text-[11px] font-bold text-brand-700 shadow-2xs dark:border-brand-900 dark:bg-brand-950/50 dark:text-brand-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
            </span>
            Listening for incoming reviews…
          </div>

          <div className="max-w-md space-y-1">
            <h4 className="text-base font-extrabold text-slatey-900 dark:text-white tracking-tight">
              {title || 'Waiting for the first sync'}
            </h4>
            <p className="text-xs text-slatey-500 dark:text-slatey-400 leading-relaxed font-medium">
              {description || 'New reviews will appear automatically.'}
            </p>
          </div>

          {actionLabel ? (
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={onAction}>
                {actionLabel}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const IconToRender = CustomIcon || Inbox

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slatey-200 bg-white/70 px-6 py-10 text-center dark:border-slatey-800 dark:bg-slatey-900/70">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slatey-100 dark:bg-slatey-800">
        <IconToRender className="h-5 w-5 text-slatey-500 dark:text-slatey-400" />
      </div>
      <div className="text-base font-semibold text-slatey-900 dark:text-white">{title}</div>
      <p className="text-sm text-slatey-500 dark:text-slatey-400">{description}</p>
      {actionLabel ? (
        <Button variant="outline" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </div>
  )
}
