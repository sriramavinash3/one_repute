import { motion } from 'framer-motion'
import { Lock, Clock } from 'lucide-react'
import Badge from '../ui/badge'

/**
 * ComingSoon - polished locked-state placeholder for features that are
 * temporarily unavailable. Keeps the feature visible in the UI while
 * disabling all interactions.
 */
export default function ComingSoon({
  title,
  message,
  badge = 'Updated Soon',
  icon: Icon = Lock
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl border border-slatey-200/60 bg-white"
      role="status"
      aria-label={message}
    >
      {/* Subtle backdrop to keep the section looking intentional */}
      <div className="absolute inset-0 bg-gradient-to-b from-slatey-50/80 via-white to-white" />
      <div className="pointer-events-none absolute -top-20 left-1/2 h-40 w-96 -translate-x-1/2 rounded-full bg-brand-500/5 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center justify-center px-6 py-16 sm:py-20 text-center">
        <div className="relative mb-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-600 shadow-glow">
            <Icon className="h-7 w-7" />
          </div>
          <span className="absolute -bottom-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-amber-100 text-amber-700">
            <Clock className="h-3.5 w-3.5" />
          </span>
        </div>

        <Badge variant="warning" className="mb-3 uppercase tracking-wider">
          {badge}
        </Badge>
        <h2 className="text-lg sm:text-xl font-bold text-slatey-900 mb-2">{title}</h2>
        <p className="max-w-md text-sm text-slatey-500 leading-relaxed">{message}</p>
      </div>
    </motion.div>
  )
}
