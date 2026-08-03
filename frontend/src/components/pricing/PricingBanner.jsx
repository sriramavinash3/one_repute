import { useState } from 'react'
import { Copy, Check, Sparkles } from 'lucide-react'
import { PRICING_CONFIG } from './pricingConfig'

export default function PricingBanner() {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(PRICING_CONFIG.couponCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-600 p-6 sm:p-8 text-white shadow-xl shadow-brand/10 mb-12">
      {/* Decorative background glows */}
      <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-brand-300/20 blur-2xl" />

      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 text-center sm:text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-md ring-1 ring-white/30 text-amber-300">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-0.5 text-xs font-bold text-amber-200 ring-1 ring-amber-300/40">
              🎉 Launch Offer
            </div>
            <h3 className="mt-1 text-xl sm:text-2xl font-extrabold tracking-tight">
              Get <span className="text-amber-300 font-black">20% OFF</span> on all Quarterly and Annual plans.
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md p-2 pl-4 rounded-2xl ring-1 ring-white/20">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-brand-100">Coupon Code</span>
            <span className="font-mono text-base font-black tracking-widest text-amber-300">
              {PRICING_CONFIG.couponCode}
            </span>
          </div>

          <button
            onClick={handleCopy}
            type="button"
            className="flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-brand-700 hover:bg-brand-50 active:scale-95 transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
            aria-label="Copy coupon code"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                <span className="text-emerald-700">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
