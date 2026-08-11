import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Sparkles, ShieldCheck, CheckCircle2, ArrowRight } from 'lucide-react'
import Button from '../ui/button'

export default function AutoResponseDisclosureModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null

  const handleGotIt = () => {
    if (onConfirm) onConfirm()
    if (onClose) onClose()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slatey-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-slatey-800 dark:bg-slatey-900"
        >
          {/* Top Decorative Banner */}
          <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-brand-500/10 blur-2xl pointer-events-none" />

          {/* Icon Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
              <Clock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Automatic Response Disclosure
              </span>
              <h3 className="text-xl font-bold text-slatey-900 dark:text-white">
                Human-Like Response Behavior
              </h3>
            </div>
          </div>

          {/* Required Exact Disclosure Message */}
          <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/70 p-4.5 dark:border-brand-500/20 dark:bg-brand-500/10">
            <p className="text-sm font-medium leading-relaxed text-slatey-800 dark:text-slatey-200">
              "OneRepute automatically responds to new reviews within 8 hours of posting. This delay is intentional to create a more natural, human-like response experience rather than an instant automated reply."
            </p>
          </div>

          {/* Bullet Breakdown */}
          <div className="mt-5 space-y-3">
            <div className="flex items-start gap-3 rounded-xl border border-slatey-100 bg-slatey-50/60 p-3 sm:p-3.5 dark:border-slatey-800 dark:bg-slatey-800/40">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
              <div className="text-xs">
                <span className="font-semibold text-slatey-800 dark:text-slatey-200">8-Hour Response Delay</span>
                <p className="mt-0.5 text-slatey-500 dark:text-slatey-400">New reviews receive an automatic reply within 8 hours of being published.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-slatey-100 bg-slatey-50/60 p-3 sm:p-3.5 dark:border-slatey-800 dark:bg-slatey-800/40">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              <div className="text-xs">
                <span className="font-semibold text-slatey-800 dark:text-slatey-200">Authentic Customer Experience</span>
                <p className="mt-0.5 text-slatey-500 dark:text-slatey-400">Avoids robotic instant replies, boosting customer trust and Google SEO parameters.</p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-slatey-100 bg-slatey-50/60 p-3 sm:p-3.5 dark:border-slatey-800 dark:bg-slatey-800/40">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
              <div className="text-xs">
                <span className="font-semibold text-slatey-800 dark:text-slatey-200">Business & Escalation Rules Intact</span>
                <p className="mt-0.5 text-slatey-500 dark:text-slatey-400">All escalation alerts, approval modes, and custom prompts remain strictly active.</p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-2">
            <Button
              onClick={handleGotIt}
              className="w-full sm:w-auto shadow-brand text-sm px-6 py-2.5 flex items-center justify-center gap-2"
            >
              Got it <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
