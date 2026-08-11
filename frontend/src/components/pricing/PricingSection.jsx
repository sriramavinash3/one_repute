import { Link } from 'react-router-dom'
import { Check, Minus, ArrowRight, Globe } from 'lucide-react'
import Button from '../ui/button'
import Badge from '../ui/badge'
import { CountryPricingProvider } from './CountryPricingProvider'
import { usePricing } from './usePricing'
import PricingBanner from './PricingBanner'
import BillingToggle from './BillingToggle'
import PricingCard from './PricingCard'

const comparisonData = [
  { feature: 'Monthly Review Responses', starter: '100 reviews', growth: '250 reviews', premium: '500 reviews' },
  { feature: 'Google Review Auto Reply', starter: true, growth: true, premium: true },
  { feature: '≤2 Star Review – AI Response', starter: true, growth: true, premium: true },
  { feature: 'Positive Review Replies', starter: true, growth: true, premium: true },
  { feature: 'WhatsApp Escalation Alert', starter: '1', growth: '2', premium: '3' },
  { feature: 'Smart QR', starter: false, growth: true, premium: true },
  { feature: 'Sentiment Analysis', starter: 'Basic', growth: true, premium: 'Advanced' },
  { feature: 'Review Dashboard', starter: 'Basic', growth: 'Full Dashboard', premium: 'Advanced Dashboard' },
  { feature: 'Monthly Report', starter: 'Comprehensive Summary', growth: 'Detailed Report with Sentiment Analysis', premium: 'Strategy Report with Action Plan' },
  { feature: 'Keyword Tracking', starter: false, growth: true, premium: true },
  { feature: 'Competitor Tracking', starter: false, growth: 'Up to 2', premium: 'Up to 5' },
  { feature: 'Multi User Access', starter: '2 Users', growth: '3 Users', premium: '5 Users' },
  { feature: 'Reply Approval Mode', starter: false, growth: false, premium: true },
  { feature: 'Escalation Matrix', starter: '1 Step', growth: '2 Step', premium: '3 Step' },
  { feature: 'Review Trend Insights', starter: false, growth: true, premium: true },
  { feature: 'Low Rating Pattern Detection', starter: false, growth: 'Basic', premium: 'Advanced' },
  { feature: 'Customer Issue Categories', starter: false, growth: true, premium: true },
  { feature: 'Monthly Strategy Call', starter: false, growth: false, premium: true },
  { feature: 'Support Priority', starter: 'Standard', growth: 'Priority', premium: 'Premium' },
]

function renderCell(val, isHighlighted = false) {
  if (val === true) {
    return (
      <div className="flex justify-center items-center">
        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check className="h-4 w-4 stroke-[2.5]" />
        </div>
      </div>
    )
  }
  if (val === false) {
    return (
      <div className="flex justify-center items-center">
        <Minus className="h-4 w-4 text-slatey-300 dark:text-slatey-600" />
      </div>
    )
  }
  return (
    <span className={`text-sm font-medium ${isHighlighted ? 'text-brand-700 font-semibold dark:text-brand-400' : 'text-slatey-700 dark:text-slatey-300'}`}>
      {val}
    </span>
  )
}

function PricingInner() {
  const { region, setRegion, billingCycle, setBillingCycle, pricingConfig, regionConfig } = usePricing()

  return (
    <div className="mx-auto max-w-7xl px-6">
      {/* Launch Offer Banner */}
      <PricingBanner />

      {/* Header & Region Switcher */}
      <div className="text-center max-w-3xl mx-auto">
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          <Badge variant="brand">Flexible Plans</Badge>

          {/* Region Toggle Selector */}
          <div className="inline-flex items-center gap-1 rounded-full bg-slatey-100 p-1 dark:bg-slatey-800 text-xs font-semibold">
            <button
              onClick={() => setRegion('IN')}
              type="button"
              className={`rounded-full px-2.5 sm:px-3 py-1.5 sm:py-1 transition-all whitespace-nowrap ${
                region === 'IN'
                  ? 'bg-white text-slatey-900 shadow-sm dark:bg-slatey-700 dark:text-white'
                  : 'text-slatey-500 hover:text-slatey-800 dark:text-slatey-400'
              }`}
            >
              🇮🇳 India (INR ₹)
            </button>
            <button
              onClick={() => setRegion('INT')}
              type="button"
              className={`rounded-full px-2.5 sm:px-3 py-1.5 sm:py-1 transition-all whitespace-nowrap ${
                region === 'INT'
                  ? 'bg-white text-slatey-900 shadow-sm dark:bg-slatey-700 dark:text-white'
                  : 'text-slatey-500 hover:text-slatey-800 dark:text-slatey-400'
              }`}
            >
              <Globe className="inline h-3 w-3 mr-1" />
              International (USD $)
            </button>
          </div>
        </div>

        <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slatey-900 dark:text-white md:text-5xl">
          Simple &amp; Transparent Pricing
        </h2>
        <p className="mt-4 text-lg text-slatey-500 dark:text-slatey-400 leading-relaxed">
          Choose the perfect plan for your business. Pricing shown for <span className="font-semibold text-slatey-800 dark:text-slatey-200">{regionConfig.name} ({regionConfig.currencyCode} {regionConfig.currencySymbol})</span>.
        </p>

        {/* Animated Billing Cycle Toggle */}
        <BillingToggle value={billingCycle} onChange={setBillingCycle} />
      </div>

      {/* Pricing Cards Grid */}
      <div className="mt-10 grid gap-8 grid-cols-1 md:grid-cols-3 items-stretch">
        {pricingConfig.plansInfo.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>

      {/* Comparison Table Section Header */}
      <div className="mt-24 mb-10 text-center">
        <h3 className="text-2xl font-bold text-slatey-900 dark:text-white">Compare Plan Features</h3>
        <p className="mt-2 text-sm text-slatey-500 dark:text-slatey-400">
          A comprehensive breakdown of all features included in each plan.
        </p>
      </div>

      {/* Feature Comparison Table */}
      <div className="overflow-hidden rounded-3xl border border-slatey-200 bg-white shadow-sm dark:border-slatey-700 dark:bg-slatey-800">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full min-w-[640px] text-left border-collapse" role="table" aria-label="Plan feature comparison">
            <thead>
              <tr className="sticky top-0 z-10 border-b border-slatey-200 bg-slatey-50/95 backdrop-blur-md dark:border-slatey-700 dark:bg-slatey-900/90">
                <th className="py-4 px-6 text-sm font-semibold text-slatey-900 dark:text-white w-1/3">Feature</th>
                <th className="py-4 px-6 text-center text-sm font-semibold text-slatey-900 dark:text-white w-1/5">Starter</th>
                <th className="py-4 px-6 text-center text-sm font-semibold text-brand-600 dark:text-brand-400 bg-brand-50/50 dark:bg-brand-950/20 w-1/5">
                  Growth
                </th>
                <th className="py-4 px-6 text-center text-sm font-semibold text-slatey-900 dark:text-white w-1/5">Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slatey-100 dark:divide-slatey-700/60">
              {comparisonData.map((row, idx) => (
                <tr
                  key={idx}
                  className="transition-colors hover:bg-brand-50/40 dark:hover:bg-slatey-700/40 odd:bg-white even:bg-slatey-50/50 dark:odd:bg-slatey-800 dark:even:bg-slatey-800/50"
                >
                  <td className="py-4 px-6 text-sm font-medium text-slatey-800 dark:text-slatey-200">
                    {row.feature}
                  </td>
                  <td className="py-4 px-6 text-center text-sm">
                    {renderCell(row.starter, false)}
                  </td>
                  <td className="py-4 px-6 text-center text-sm bg-brand-50/30 dark:bg-brand-950/10">
                    {renderCell(row.growth, true)}
                  </td>
                  <td className="py-4 px-6 text-center text-sm">
                    {renderCell(row.premium, true)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom CTA Banner */}
      <div className="mt-20 relative overflow-hidden rounded-3xl bg-slatey-900 py-12 px-8 text-center text-white shadow-2xl dark:border dark:border-slatey-700">
        <div className="absolute left-0 top-0 -translate-x-1/3 -translate-y-1/3 rounded-full bg-brand-600/20 blur-3xl h-64 w-64" />
        <div className="absolute right-0 bottom-0 translate-x-1/3 translate-y-1/3 rounded-full bg-brand-500/20 blur-3xl h-64 w-64" />

        <h3 className="relative z-10 text-2xl sm:text-3xl md:text-4xl text-white font-extrabold">
          Ready to Grow Your Online Reputation?
        </h3>
        <p className="relative z-10 mt-3 text-sm sm:text-base text-slatey-300 max-w-2xl mx-auto">
          Start automating review management with AI and deliver exceptional customer experiences.
        </p>

        <div className="relative z-10 mt-8 flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-4">
          <Link to="/login" className="w-full sm:w-auto">
            <Button size="lg" className="h-12 w-full sm:w-auto px-8 bg-brand-600 hover:bg-brand-500 text-white shadow-brand font-semibold">
              Get Started
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="h-12 w-full sm:w-auto px-8 bg-slatey-800 text-white border-slatey-700 hover:bg-slatey-700 font-semibold">
              Contact Sales
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function PricingSection() {
  return (
    <section id="pricing" className="py-24 bg-white dark:bg-slatey-900 selection:bg-brand-100 selection:text-brand-900">
      <CountryPricingProvider>
        <PricingInner />
      </CountryPricingProvider>
    </section>
  )
}
