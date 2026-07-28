import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, Store, CreditCard, Sparkles } from 'lucide-react'
import { db } from '../firebase/firebase'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../services/apiClient'
import { createSubscription, verifyPayment, loadRazorpayScript } from '../services/paymentService'
import { fetchPlaceSuggestions, fetchPlaceDetails } from '../services/outletService'

const PLANS = [
  {
    id: 'plan_starter',
    name: 'Starter',
    price: '$29',
    description: 'Essential reputation management for single locations.',
    features: [
      '100 Review Responses',
      'Google Review Auto Reply',
      'Positive Review Replies',
      'WhatsApp Alerts (30 min)',
      'Basic Sentiment & Dashboard',
      'Monthly Summary Report',
      '1 User Access',
      '1-Step Escalation'
    ]
  },
  {
    id: 'plan_growth',
    name: 'Growth',
    price: '$79',
    description: 'For growing businesses wanting deeper insights.',
    features: [
      '250 Review Responses',
      '<=2 Star AI Response',
      'WhatsApp + Email Alerts (5 min)',
      'Full Dashboard & Trend Insights',
      'Low Rating Pattern Detection',
      'Competitor Tracking (Up to 2)',
      '2 User Access',
      '2-Step Escalation'
    ],
    recommended: true
  },
  {
    id: 'plan_premium',
    name: 'Premium',
    price: '$199',
    description: 'Advanced analytics and premium support.',
    features: [
      '500 Review Responses',
      'Priority Escalation (30 sec)',
      'Advanced Sentiment & Dashboard',
      'Keyword & Competitor (5) Tracking',
      'Reply Approval Mode',
      'Monthly Strategy Call & Premium Support',
      '5 User Access',
      '3-Step Escalation'
    ]
  }
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [step, setStep] = useState(1)
  
  const [form, setForm] = useState({
    businessName: '',
    businessType: '',
    managerPhone: '',
    address: '',
    placeId: '',
    planId: 'plan_growth'
  })

  const [placeSearch, setPlaceSearch] = useState('')
  const [placeSuggestions, setPlaceSuggestions] = useState([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [sessionToken, setSessionToken] = useState('')
  const [autocompleteError, setAutocompleteError] = useState('')

  useEffect(() => {
    setSessionToken(window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
  }, [])

  useEffect(() => {
    const query = placeSearch.trim()
    if (query.length < 3) {
      setPlaceSuggestions([])
      return
    }

    const timer = window.setTimeout(async () => {
      setSuggestionsLoading(true)
      setAutocompleteError('')
      try {
        const suggestions = await fetchPlaceSuggestions(query, sessionToken)
        setPlaceSuggestions(suggestions)
      } catch (error) {
        setPlaceSuggestions([])
        setAutocompleteError(error?.message || 'Unable to fetch place suggestions.')
      } finally {
        setSuggestionsLoading(false)
      }
    }, 350)

    return () => window.clearTimeout(timer)
  }, [placeSearch, sessionToken])

  const handleSelectPlace = async (suggestion) => {
    setPlaceSearch(suggestion.description)
    setPlaceSuggestions([])
    setForm((prev) => ({ ...prev, placeId: suggestion.placeId }))

    try {
      const details = await fetchPlaceDetails(suggestion.placeId, sessionToken)
      setForm((prev) => ({
        ...prev,
        businessName: details.name || prev.businessName,
        address: details.formatted_address || prev.address,
        managerPhone: details.phone || prev.managerPhone,
      }))
    } catch (error) {
      toast.error('Failed to load business details.')
    }
  }

  useEffect(() => {
    if (profile?.outletId && profile?.isSetupComplete) {
      navigate('/outlet-dashboard')
    }
  }, [profile, navigate])

  const handleNextStep = (e) => {
    e.preventDefault()
    if (step === 1 && form.businessName && form.businessType && form.managerPhone) {
      setStep(2)
    }
  }

  const completeSetup = async (paymentData = null, isTrial = false) => {
    setLoading(true)
    try {
      // Call backend API to bypass restrictive frontend Firestore rules
      const { data } = await apiClient.post('/api/auth/onboard', {
        form,
        paymentData,
        isTrial,
        userUid: user.uid,
        userEmail: user.email
      })

      if (!data.success) {
        throw new Error('Onboarding failed on the server.')
      }

      toast.success(isTrial ? '14-Day Free Trial started!' : 'Subscription activated successfully!')
      
      // Reload the page to refresh AuthContext completely with the new profile data
      window.location.href = '/outlet-dashboard'
    } catch (error) {
      toast.error('Setup failed: ' + (error.response?.data?.error || error.message))
    } finally {
      setLoading(false)
    }
  }

  const startTrial = () => {
    completeSetup(null, true)
  }

  const handlePayment = async () => {
    setLoading(true)
    try {
      const isLoaded = await loadRazorpayScript()
      if (!isLoaded) {
        throw new Error('Razorpay SDK failed to load. Are you online?')
      }

      // Temporary dummy customer ID for subscription creation before saving to DB
      const tempCustomerId = 'cust_' + Date.now()
      
      // Call backend to create Razorpay Subscription
      const subscription = await createSubscription(tempCustomerId, form.planId)

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_dummy',
        subscription_id: subscription.id,
        name: 'One Repute',
        description: 'Monthly Subscription',
        handler: async function (response) {
          try {
            await verifyPayment(response.razorpay_payment_id, response.razorpay_signature, response.razorpay_subscription_id, tempCustomerId)
            completeSetup(response, false)
          } catch (err) {
            toast.error('Payment verification failed.')
            setLoading(false)
          }
        },
        prefill: {
          name: form.businessName,
          email: user?.email || '',
          contact: form.managerPhone
        },
        theme: {
          color: '#4f46e5'
        }
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', function (response) {
        toast.error(response.error.description)
        setLoading(false)
      })
      rzp.open()
    } catch (error) {
      toast.error(error.message || 'Payment initiation failed')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slatey-50 items-center justify-center p-4">
      <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slatey-100">
        
        {/* Left Sidebar Steps */}
        <div className="hidden md:block col-span-2 bg-brand-600 p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <h2 className="text-2xl font-bold relative z-10 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-brand-100" />
            One Repute
          </h2>
          <p className="text-brand-100 mt-2 text-sm relative z-10">Set up your workspace in minutes.</p>
          
          <div className="mt-12 space-y-8 relative z-10">
            <div className={`flex items-start gap-4 transition-opacity ${step === 1 ? 'opacity-100' : 'opacity-50'}`}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${step === 1 ? 'border-white bg-brand-500 text-white' : 'border-brand-400 text-brand-200'}`}>1</div>
              <div>
                <h3 className="font-semibold">Business Details</h3>
                <p className="text-xs text-brand-100 mt-1">Basic information</p>
              </div>
            </div>
            <div className={`flex items-start gap-4 transition-opacity ${step === 2 ? 'opacity-100' : 'opacity-50'}`}>
              <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${step === 2 ? 'border-white bg-brand-500 text-white' : 'border-brand-400 text-brand-200'}`}>2</div>
              <div>
                <h3 className="font-semibold">Select Plan</h3>
                <p className="text-xs text-brand-100 mt-1">Start your 14-day free trial</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content Area */}
        <div className="col-span-3 p-8 md:p-12 relative">
          <AnimatePresence mode="wait">
            
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="h-full flex flex-col justify-center"
              >
                <div>
                  <h1 className="text-2xl font-bold text-slatey-900">Tell us about your business</h1>
                  <p className="mt-2 text-sm text-slatey-500">We'll tailor your AI models based on these details.</p>
                </div>
                
                <form onSubmit={handleNextStep} className="mt-8 space-y-5">
                  <div className="space-y-1.5 relative">
                    <label className="text-xs font-semibold text-slatey-700 ml-1">Search Business Listing</label>
                    <Input
                      placeholder="Search business name or address"
                      value={placeSearch}
                      onChange={(e) => {
                        setPlaceSearch(e.target.value)
                        setForm({ ...form, businessName: e.target.value })
                      }}
                      className="h-12 bg-slatey-50"
                    />
                    {suggestionsLoading && (
                      <div className="mt-2 text-xs text-slatey-500 ml-1">Searching for matching businesses...</div>
                    )}
                    {autocompleteError && (
                      <div className="mt-2 text-xs text-rose-500 ml-1">{autocompleteError}</div>
                    )}
                    <AnimatePresence>
                      {placeSuggestions.length > 0 && (
                        <motion.ul
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slatey-200 bg-white p-2 shadow-lg shadow-brand-100/20"
                        >
                          {placeSuggestions.map((suggestion) => (
                            <li
                              key={suggestion.placeId}
                              onClick={() => handleSelectPlace(suggestion)}
                              className="cursor-pointer rounded-lg px-3 py-2 text-sm text-slatey-700 transition hover:bg-slatey-50"
                            >
                              <div className="font-medium">{suggestion.structured_formatting?.main_text || suggestion.description}</div>
                              <div className="text-xs text-slatey-500">{suggestion.structured_formatting?.secondary_text}</div>
                            </li>
                          ))}
                        </motion.ul>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slatey-700 ml-1">Business Name</label>
                    <Input
                      placeholder="e.g. The Grand Bistro"
                      value={form.businessName}
                      onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                      required
                      className="h-12 bg-slatey-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slatey-700 ml-1">Business Category</label>
                    <Input
                      placeholder="e.g. Fine Dining, Cafe, Fast Food"
                      value={form.businessType}
                      onChange={(e) => setForm({ ...form, businessType: e.target.value })}
                      required
                      className="h-12 bg-slatey-50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slatey-700 ml-1">Manager WhatsApp Number</label>
                    <Input
                      type="tel"
                      pattern="^\+[1-9]\d{1,14}$"
                      title="Please include your country code (e.g. +1234567890)"
                      placeholder="e.g. +1234567890"
                      value={form.managerPhone}
                      onChange={(e) => setForm({ ...form, managerPhone: e.target.value })}
                      required
                      className="h-12 bg-slatey-50"
                    />
                    <p className="text-[10px] text-slatey-400 ml-1">Used for critical escalation alerts. Must include country code (e.g., +1).</p>
                  </div>
                  
                  <div className="pt-4">
                    <Button type="submit" size="lg" className="w-full flex items-center justify-center gap-2">
                      Continue <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div>
                  <h1 className="text-2xl font-bold text-slatey-900">Choose your plan</h1>
                  <p className="mt-2 text-sm text-slatey-500">Start with a 14-day free trial. No credit card required.</p>
                </div>
                
                <div className="mt-6 space-y-4">
                  {PLANS.map(plan => (
                    <div 
                      key={plan.id}
                      onClick={() => setForm({...form, planId: plan.id})}
                      className={`relative cursor-pointer rounded-2xl border-2 p-5 transition-all ${
                        form.planId === plan.id 
                          ? 'border-brand-500 bg-brand-50 shadow-md shadow-brand-100/50' 
                          : 'border-slatey-200 hover:border-brand-300 hover:bg-slatey-50'
                      }`}
                    >
                      {plan.recommended && (
                        <span className="absolute -top-3 left-4 bg-brand-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                          Recommended
                        </span>
                      )}
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-slatey-900 text-lg">{plan.name}</h3>
                          <p className="text-xs text-slatey-500 mt-1">{plan.description}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-xl font-bold text-brand-600">{plan.price}</span>
                          <span className="text-xs text-slatey-500">/mo</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="mt-8 flex flex-col gap-3">
                  <Button size="lg" className="w-full shadow-brand text-md" onClick={startTrial} disabled={loading}>
                    {loading ? 'Processing...' : 'Start 14-Day Free Trial'}
                  </Button>
                  <Button variant="outline" className="w-full text-slatey-500 flex items-center justify-center gap-2" onClick={handlePayment} disabled={loading}>
                    <CreditCard className="h-4 w-4" /> Skip trial & Pay Now
                  </Button>
                  <button onClick={() => setStep(1)} className="text-xs text-center text-slatey-400 hover:text-slatey-700 mt-2 font-medium">
                    Back to details
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
