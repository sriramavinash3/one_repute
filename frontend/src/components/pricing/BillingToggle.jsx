import { motion } from 'framer-motion'

const cycles = [
  { id: 'monthly', label: 'Monthly', badge: null },
  { id: 'quarterly', label: 'Quarterly', badge: null },
  { id: 'annual', label: 'Annual', badge: null },
]

export default function BillingToggle({ value, onChange }) {
  return (
    <div className="flex justify-center my-8">
      <div
        className="inline-flex items-center gap-1 rounded-2xl bg-slatey-100 p-1.5 dark:bg-slatey-800 border border-slatey-200/80 dark:border-slatey-700 shadow-inner"
        role="tablist"
        aria-label="Billing cycle selector"
      >
        {cycles.map((item) => {
          const isActive = value === item.id
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              className={`relative flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50 ${
                isActive
                  ? 'text-slatey-900 dark:text-white'
                  : 'text-slatey-500 hover:text-slatey-800 dark:text-slatey-400 dark:hover:text-slatey-200'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeBillingTab"
                  className="absolute inset-0 rounded-xl bg-white shadow-sm dark:bg-slatey-700"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{item.label}</span>
              {item.badge && (
                <span
                  className={`relative z-10 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase transition-colors ${
                    isActive
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                      : 'bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
