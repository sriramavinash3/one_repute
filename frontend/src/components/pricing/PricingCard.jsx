import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Sparkles, ArrowRight } from 'lucide-react'
import Button from '../ui/button'
import { usePricing } from './usePricing'

export default function PricingCard({ plan }) {
  const { getPlanPricing } = usePricing()
  const pricing = getPlanPricing(plan.id)

  return (
    <motion.div
      whileHover={{ y: -6 }}
      transition={{ duration: 0.2 }}
      className={`relative flex flex-col justify-between rounded-3xl p-8 transition-all duration-300 ${
        plan.isPopular
          ? 'border-2 border-brand-500 bg-gradient-to-b from-brand-50/40 via-white to-white shadow-xl ring-1 ring-brand-500/20 dark:from-brand-950/20 dark:via-slatey-800 dark:to-slatey-800 dark:border-brand-500'
          : 'border border-slatey-200 bg-white shadow-sm hover:shadow-md dark:border-slatey-700 dark:bg-slatey-800'
      }`}
    >
      {plan.isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-10">
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-600 px-4 py-1 text-xs font-semibold text-white shadow-sm">
            <Sparkles className="h-3 w-3" /> Most Popular
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-2xl font-bold text-slatey-900 dark:text-white">{plan.name}</h3>
          {pricing.isDiscounted && (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 dark:bg-amber-900/60 dark:text-amber-300">
              {pricing.discountPercent}% OFF
            </span>
          )}
        </div>

        <p className="mt-2 text-sm text-slatey-500 dark:text-slatey-400 min-h-[40px]">{plan.tagline}</p>

        {/* Dynamic Pricing Box */}
        <div className="mt-6 mb-8 py-5 px-6 rounded-2xl bg-slatey-50 dark:bg-slatey-900/60 border border-slatey-100 dark:border-slatey-700/50">
          {pricing.isDiscounted ? (
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slatey-400 dark:text-slatey-500 line-through">
                  {pricing.formattedOriginal}
                </span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  Save {pricing.discountPercent}%
                </span>
              </div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-4xl font-extrabold text-slatey-900 dark:text-white tracking-tight">
                  {pricing.formattedDiscounted}
                </span>
                <span className="text-sm font-medium text-slatey-500 dark:text-slatey-400">
                  {pricing.billingCycleLabel}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold text-slatey-900 dark:text-white tracking-tight">
                {pricing.formattedOriginal}
              </span>
              <span className="text-sm font-medium text-slatey-500 dark:text-slatey-400">
                {pricing.billingCycleLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <div>
        <Link to="/login" className="block w-full">
          <Button
            variant={plan.isPopular ? 'primary' : 'outline'}
            size="lg"
            className={`w-full h-12 font-semibold ${
              plan.isPopular
                ? 'shadow-brand'
                : 'bg-white hover:bg-slatey-50 dark:bg-slatey-800 dark:hover:bg-slatey-700'
            }`}
          >
            Get Started
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </motion.div>
  )
}
