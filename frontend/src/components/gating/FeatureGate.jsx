import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Sparkles, Check, HelpCircle, X, ShieldAlert, ArrowRight } from 'lucide-react'
import { useSubscription } from '../../contexts/SubscriptionContext'
import Button from '../ui/button'

/**
 * FeatureGate wrapper component to gate access to premium features.
 */
export function FeatureGate({ featureKey, children, fallback, customTitle }) {
  const { hasFeature, remainingLimit } = useSubscription()
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)

  const isAllowed = hasFeature(featureKey) && remainingLimit(featureKey) > 0

  if (isAllowed) {
    return children
  }

  if (fallback) {
    return fallback
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slatey-200/60 bg-slatey-50/50 p-6 text-center">
      {/* Blurred preview of card contents */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[6px] transition-all duration-300" />
      
      <div className="relative z-10 flex flex-col items-center justify-center py-8 px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 shadow-glow mb-4">
          <Lock className="h-5 w-5" />
        </div>
        <h3 className="text-base font-bold text-slatey-900 mb-2">
          {customTitle || 'Premium Feature Locked'}
        </h3>
        <p className="max-w-md text-xs text-slatey-500 mb-6 leading-relaxed">
          Upgrade your subscription plan to unlock advanced settings, multi-level escalations, competitor monitoring, and AI automation tools.
        </p>
        <Button 
          variant="primary" 
          onClick={() => setShowUpgradeModal(true)}
          className="shadow-brand text-xs px-5 py-2.5 flex items-center gap-2"
        >
          <Sparkles className="h-4 w-4" /> Compare Plans & Upgrade
        </Button>
      </div>

      <AnimatePresence>
        {showUpgradeModal && (
          <UpgradeModal onClose={() => setShowUpgradeModal(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * LockedPlaceholder to blur standard page contents.
 */
export function LockedPlaceholder({ title, description, onUnlock }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 bg-white/60 dark:bg-slatey-950/40 backdrop-blur-md rounded-2xl border border-slatey-150/80 shadow-glow">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 shadow-glow mb-4 animate-pulse">
        <Lock className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-bold text-slatey-900 mb-2">{title || 'Access Restricted'}</h3>
      <p className="max-w-md text-center text-xs text-slatey-500 mb-8 leading-relaxed">
        {description || 'This module is restricted under your current Starter subscription. Upgrade to Growth or Premium for instant access.'}
      </p>
      <Button variant="primary" onClick={onUnlock} className="shadow-brand flex items-center gap-2">
        <Sparkles className="h-4 w-4" /> Upgrade Plan
      </Button>
    </div>
  )
}

/**
 * UpgradeModal - Premium subscription comparator layout.
 */
export function UpgradeModal({ onClose }) {
  const { billingInfo, changePlan, checkoutSubscription } = useSubscription()
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [selectedCurrency, setSelectedCurrency] = useState('INR')
  const [showIntlWarning, setShowIntlWarning] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState(null)
  const [loadingPlan, setLoadingPlan] = useState(null)

  const currentPlan = billingInfo?.subscription?.plan || 'plan_starter'

  useEffect(() => {
    // If billing details are loaded and country is not India, flag international
    if (billingInfo?.subscription?.billingCountry && billingInfo.subscription.billingCountry !== 'IN') {
      setSelectedCurrency('USD')
      setShowIntlWarning(true)
      setPendingCurrency('USD')
    } else if (!billingInfo) {
      // Guest/Draft Geolocation Check
      async function detect() {
        try {
          const res = await fetch('/api/payments/detect-location')
          if (res.ok) {
            const data = await res.json()
            if (data.country !== 'IN') {
              setSelectedCurrency('USD')
              setShowIntlWarning(true)
              setPendingCurrency('USD')
            }
          }
        } catch (e) {
          // ignore
        }
      }
      detect()
    }
  }, [billingInfo])

  const PLAN_DETAILS = [
    {
      id: 'plan_starter',
      name: 'Starter',
      description: 'Ideal for local stores and startups looking to monitor basic reviews.',
      monthlyPriceINR: 999,
      annualPriceINR: 9990,
      monthlyPriceUSD: 29,
      annualPriceUSD: 290,
      features: [
        '100 Monthly Review Responses',
        'Google Review Auto Reply',
        'AI Reply for <=2 Star Reviews',
        'Positive Review Replies',
        '1 Level WhatsApp Escalation',
        'Basic Sentiment Analysis',
        'Basic Dashboard & Monthly Report',
        '2 Team Members limit',
      ],
      disabledFeatures: [
        'Smart QR Code Campaigns',
        'Competitor Tracking',
        'Approval Workflow Queue',
        'Advanced Issue Categories',
      ]
    },
    {
      id: 'plan_growth',
      name: 'Growth',
      description: 'Perfect for growing brands needing automation and multi-channel matrix alerts.',
      monthlyPriceINR: 1999,
      annualPriceINR: 19990,
      monthlyPriceUSD: 79,
      annualPriceUSD: 790,
      popular: true,
      features: [
        '250 Monthly Review Responses',
        'Google Review Auto Reply',
        'AI Reply for <=2 Star Reviews',
        'Positive Review Replies',
        '2 Levels WhatsApp Escalation',
        'Smart QR Code Campaigns',
        'Standard Sentiment & Trend Analysis',
        '2 Competitors Tracking',
        '3 Team Members limit',
        'Advanced Issue Categories',
      ],
      disabledFeatures: [
        'Approval Workflow Queue',
        'Premium Support Support Priority',
        'Monthly Strategy Strategy Call',
      ]
    },
    {
      id: 'plan_premium',
      name: 'Premium',
      description: 'Enterprise grade response controls, AI strategy advisory, and custom integrations.',
      monthlyPriceINR: 2999,
      annualPriceINR: 29990,
      monthlyPriceUSD: 199,
      annualPriceUSD: 1990,
      features: [
        '500 Monthly Review Responses',
        'Google Review Auto Reply',
        'AI Reply for <=2 Star Reviews',
        'Positive Review Replies',
        '3 Levels WhatsApp Escalation',
        'Smart QR Code Campaigns',
        'Advanced Sentiment Analysis',
        '5 Competitors Tracking',
        '5 Team Members limit',
        'Reply Approval Workflow',
        'Low Rating Pattern Detection',
        'Monthly Strategy Strategy Call',
        'Premium Support Priority',
      ],
      disabledFeatures: []
    }
  ]

  const handleSelectPlan = async (planId) => {
    if (planId === currentPlan) return
    setLoadingPlan(planId)
    
    const isInactive = !billingInfo?.subscription || billingInfo.subscription.status === 'inactive'
    
    let success = false
    if (isInactive) {
      success = await checkoutSubscription(planId, billingCycle)
    } else {
      success = await changePlan(planId, billingCycle)
    }
    
    setLoadingPlan(null)
    if (success) {
      onClose()
    }
  }

  const handleCurrencyChange = (curr) => {
    if (curr === 'USD') {
      setPendingCurrency('USD')
      setShowIntlWarning(true)
    } else {
      setSelectedCurrency('INR')
    }
  }

  const confirmIntlBilling = () => {
    setSelectedCurrency(pendingCurrency)
    setShowIntlWarning(false)
    setPendingCurrency(null)
  }

  const cancelIntlBilling = () => {
    setShowIntlWarning(false)
    setPendingCurrency(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slatey-900/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative w-full max-w-5xl rounded-3xl bg-white p-6 md:p-8 shadow-2xl border border-slatey-150 max-h-[90vh] overflow-y-auto"
      >
        <button 
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-slatey-50 text-slatey-400 hover:text-slatey-700 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">
            <Sparkles className="h-3 w-3" /> Upgrade Workspace
          </span>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slatey-900">Choose the perfect plan for your business</h2>
          <p className="text-sm text-slatey-500 mt-2">Unlock smart reviews automation, escalation matrices, and reputation analytics.</p>
          
          {/* Controls Toggles */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-6">
            {/* Billing Cycle Selector */}
            <div className="inline-flex items-center gap-1 bg-slatey-100 p-1 rounded-full shadow-inner">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`text-xs font-semibold px-4 py-2 rounded-full transition ${
                  billingCycle === 'monthly' ? 'bg-white text-slatey-950 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'
                }`}
              >
                Monthly Billing
              </button>
              <button
                onClick={() => setBillingCycle('annual')}
                className={`text-xs font-semibold px-4 py-2 rounded-full transition flex items-center gap-1.5 ${
                  billingCycle === 'annual' ? 'bg-white text-slatey-950 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'
                }`}
              >
                Annual Billing 
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold">Save 20%</span>
              </button>
            </div>

            {/* Currency selector */}
            <div className="inline-flex items-center gap-1 bg-slatey-100 p-1 rounded-full shadow-inner">
              <button
                onClick={() => handleCurrencyChange('INR')}
                className={`text-xs font-semibold px-4 py-2 rounded-full transition ${
                  selectedCurrency === 'INR' ? 'bg-white text-slatey-950 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'
                }`}
              >
                INR (₹)
              </button>
              <button
                onClick={() => handleCurrencyChange('USD')}
                className={`text-xs font-semibold px-4 py-2 rounded-full transition ${
                  selectedCurrency === 'USD' ? 'bg-white text-slatey-950 shadow-sm' : 'text-slatey-500 hover:text-slatey-800'
                }`}
              >
                USD ($)
              </button>
            </div>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {PLAN_DETAILS.map((plan) => {
            const isCurrent = plan.id === currentPlan
            const dbPlan = billingInfo?.plans?.find(p => p.id === plan.id)
            const monthlyPrice = dbPlan ? dbPlan.monthlyPrice : (selectedCurrency === 'INR' ? plan.monthlyPriceINR : plan.monthlyPriceUSD)
            const annualPrice = dbPlan ? dbPlan.annualPrice : (selectedCurrency === 'INR' ? plan.annualPriceINR : plan.annualPriceUSD)
            const price = billingCycle === 'annual' ? annualPrice : monthlyPrice
            const period = billingCycle === 'annual' ? '/ year' : '/ month'
            const symbol = dbPlan ? dbPlan.currencySymbol : (selectedCurrency === 'INR' ? '₹' : '$')

            return (
              <div 
                key={plan.id}
                className={`relative flex flex-col rounded-2xl bg-white p-5 border shadow-sm transition-all duration-300 ${
                  plan.popular ? 'border-brand-500 ring-2 ring-brand-500/20 shadow-glow' : 'border-slatey-200'
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-1 text-[10px] font-bold text-white uppercase tracking-wider shadow-brand">
                    Most Popular
                  </span>
                )}

                <div className="mb-5">
                  <h3 className="text-lg font-bold text-slatey-900">{plan.name}</h3>
                  <p className="text-xs text-slatey-400 mt-1.5 h-10 leading-normal">{plan.description}</p>
                  
                  <div className="flex items-baseline gap-1 mt-4">
                    <span className="text-3xl font-extrabold text-slatey-950">{symbol}{price.toLocaleString()}</span>
                    <span className="text-xs text-slatey-500 font-semibold">{period}</span>
                  </div>
                </div>

                <Button
                  variant={isCurrent ? 'outline' : plan.popular ? 'primary' : 'secondary'}
                  className={`w-full py-2.5 text-xs font-bold mb-6 ${
                    plan.popular && !isCurrent ? 'shadow-brand' : ''
                  }`}
                  onClick={() => handleSelectPlan(plan.id)}
                  disabled={isCurrent || loadingPlan !== null}
                >
                  {loadingPlan === plan.id ? 'Processing...' : isCurrent ? 'Active Plan' : 'Select Plan'}
                </Button>

                {/* Features List */}
                <div className="flex-1 space-y-3">
                  <p className="text-[10px] font-bold text-slatey-400 uppercase tracking-wider mb-2">What is included</p>
                  {plan.features.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-slatey-700 font-medium leading-relaxed">{feat}</span>
                    </div>
                  ))}

                  {plan.disabledFeatures.map((feat, i) => (
                    <div key={i} className="flex items-start gap-2.5 opacity-40">
                      <Lock className="h-3 w-3 text-slatey-400 shrink-0 mt-1" />
                      <span className="text-xs text-slatey-500 font-medium line-through leading-relaxed">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </motion.div>

      {/* International Billing Warning Dialog */}
      <AnimatePresence>
        {showIntlWarning && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slatey-900/60 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-white rounded-2xl p-6 border border-slatey-200 shadow-2xl space-y-4 text-center"
            >
              <div className="h-12 w-12 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-2">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slatey-900">International Billing</h3>
              <p className="text-xs text-slatey-500 leading-relaxed">
                You are purchasing from outside India.
                Your payment will be securely processed using the supported international payment options available for your country. Currency conversion, taxes, or bank charges may apply depending on your payment method and issuing bank.
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <Button variant="ghost" onClick={cancelIntlBilling} className="text-xs">
                  Back
                </Button>
                <Button variant="primary" onClick={confirmIntlBilling} className="text-xs">
                  Continue
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
