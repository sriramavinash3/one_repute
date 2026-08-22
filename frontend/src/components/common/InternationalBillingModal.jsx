import { motion, AnimatePresence } from 'framer-motion'
import { Globe, X } from 'lucide-react'
import Button from '../ui/button'

/**
 * Standardized International Billing Locked-State Modal.
 * Displayed whenever a user attempts to access, select, enable, configure,
 * or use any International Billing functionality prior to official launch.
 */
export default function InternationalBillingModal({ isOpen, onClose }) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slatey-900/60 backdrop-blur-sm overflow-y-auto"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) {
            onClose()
          }
        }}
        aria-modal="true"
        role="dialog"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="relative w-full max-w-md rounded-3xl bg-white p-6 sm:p-8 shadow-2xl border border-slatey-150 text-center dark:bg-slatey-900 dark:border-slatey-800 my-8"
        >
          {/* Close button */}
          <button
            onClick={onClose}
            type="button"
            className="absolute right-4 top-4 rounded-full p-2 text-slatey-400 hover:bg-slatey-100 hover:text-slatey-700 dark:hover:bg-slatey-800 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon Header */}
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400 mx-auto mb-5 shadow-sm">
            <Globe className="h-8 w-8" />
          </div>

          {/* Title & Message */}
          <h3 className="text-xl font-extrabold text-slatey-900 dark:text-white tracking-tight">
            International Billing
          </h3>
          <p className="mt-3 text-base font-semibold text-brand-600 dark:text-brand-400">
            We launch it soon.
          </p>
          <p className="mt-2 text-xs text-slatey-500 dark:text-slatey-400 leading-relaxed max-w-xs mx-auto">
            International payments and multi-currency options are currently under preparation. Domestic billing remains fully active.
          </p>

          {/* Action Button */}
          <div className="mt-6">
            <Button
              variant="primary"
              size="lg"
              onClick={onClose}
              className="w-full h-11 shadow-brand font-semibold text-xs uppercase tracking-wider"
            >
              Got it
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
