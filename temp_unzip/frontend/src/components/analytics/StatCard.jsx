import { motion } from 'framer-motion'
import { cn } from '../../lib/utils'

export default function StatCard({ title, value, delta, icon, className }) {
  return (
    <motion.div
      className={cn('rounded-2xl border border-slatey-200 bg-white/80 p-5 shadow-sm dark:border-slatey-800 dark:bg-slatey-900/80', className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slatey-400">{title}</p>
          <p className="mt-3 text-2xl font-semibold text-slatey-900 dark:text-slatey-100">{value}</p>
          {delta ? <p className="mt-2 text-sm text-emerald-600">{delta}</p> : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
          {icon}
        </div>
      </div>
    </motion.div>
  )
}
