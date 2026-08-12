import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, ChevronRight, Store, CreditCard, Sparkles, Tag, X, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { db } from '../firebase/firebase'
import Button from '../components/ui/button'
import Input from '../components/ui/input'
import { useAuth } from '../contexts/AuthContext'
import apiClient from '../services/apiClient'
import { buildOAuthUrl, getOAuthMessageOrigins } from '../services/googleAuthService'
import { createSubscription, verifyPayment, loadRazorpayScript } from '../services/paymentService'
import { fetchPlaceSuggestions, fetchPlaceDetails } from '../services/outletService'
import Logo from '../components/common/Logo'
import Seo from '../components/seo/Seo'
import { PRICING_CONFIG, formatPrice } from '../components/pricing/pricingConfig'

import AutoResponseDisclosureModal from '../components/onboarding/AutoResponseDisclosureModal'

const PLANS = [
  {
    id: 'plan_starter',
    name: 'Starter',
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
    businessType: 'General Business',
    countryCode: '+91',
    primaryWhatsAppNumber: '',
    managerPhone: '',
    address: '',
    placeId: '',
    planId: 'plan_growth'
  })

  const [googleConnected, setGoogleConnected] = useState(false)
  const [gmbLocations, setGmbLocations] = useState([])
  const [locationsLoading, setLocationsLoading] = useState(false)
  const [locationsError, setLocationsError] = useState(null)
  const [showDisclosureModal, setShowDisclosureModal] = useState(false)
  
  const [discountCode, setDiscountCode] = useState('')
  const [discountData, setDiscountData] = useState(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)

  const handleSelectLocation = useCallback((locationId, locationsArray = gmbLocations) => {
    const loc = locationsArray.find(l => l.id === locationId)
    if (!loc) return
    const gmbCategory = loc?.category || loc?.primaryCategory?.displayName || loc?.primaryCategory || 'General Business'
    setForm(prev => ({
      ...prev,
      placeId: locationId,
      businessName: loc?.name || prev.businessName,
      businessType: gmbCategory,
      address: loc?.address || loc?.addressLines?.join(', ') || prev.address
    }))
  }, [gmbLocations])

  const inFlightRef = useRef(false)
  const pollTimerRef = useRef(null)
  const maxTimeoutRef = useRef(null)

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    if (maxTimeoutRef.current) {
      clearTimeout(maxTimeoutRef.current)
      maxTimeoutRef.current = null
    }
  }, [])

  /**
   * Reliably loads the Google Business data collected during the OAuth flow.
   * Consumes explicit session status: 'loading', 'ready', 'no_data', 'error', 'completed'.
   */
  const loadOnboardingSession = useCallback(async (fallbackLocations) => {
    if (!user?.uid || inFlightRef.current) return false
    inFlightRef.current = true

    try {
      const { data } = await apiClient.get(`/api/auth/onboarding-session/${user.uid}`)
      const status = data?.status
      const gbp = data?.googleBusinessProfile || {}
      const locs = gbp.locations || data?.googleLocations || []
      const warning = gbp.warning || data?.googleLocationsWarning || ''
      const errorMsg = gbp.error || data?.session?.error || null

      if (status === 'completed') {
        stopPolling()
        setLocationsLoading(false)
        navigate('/outlet-dashboard')
        return true
      }

      if (status === 'ready') {
        stopPolling()
        setGmbLocations(locs)
        setGoogleConnected(true)
        setLocationsError(null)
        setLocationsLoading(false)
        if (locs.length === 1) {
          handleSelectLocation(locs[0].id, locs)
        }
        return true
      }

      if (status === 'no_data') {
        stopPolling()
        setGmbLocations([])
        setGoogleConnected(gbp.connected ?? true)
        setLocationsError({
          type: 'warning',
          message: warning || 'No business locations were found for this Google account.'
        })
        setLocationsLoading(false)
        return true
      }

      if (status === 'error') {
        stopPolling()
        setGmbLocations([])
        setGoogleConnected(false)
        setLocationsError({
          type: 'error',
          message: errorMsg || 'Google connection failed. Please try again.'
        })
        setLocationsLoading(false)
        return false
      }

      // If status === 'loading'
      setLocationsLoading(true)
      return false
    } catch (error) {
      if (Array.isArray(fallbackLocations) && fallbackLocations.length > 0) {
        stopPolling()
        setGmbLocations(fallbackLocations)
        setGoogleConnected(true)
        setLocationsLoading(false)
        if (fallbackLocations.length === 1) {
          handleSelectLocation(fallbackLocations[0].id, fallbackLocations)
        }
        return true
      }
      stopPolling()
      setLocationsLoading(false)
      if (error?.response?.status === 404) {
        setLocationsError({ type: 'error', message: 'Unable to retrieve your onboarding session. Please restart onboarding.' })
      } else {
        setLocationsError({ type: 'error', message: error?.response?.data?.error || 'Failed to load Google Business data. Please try again.' })
      }
      return false
    } finally {
      inFlightRef.current = false
    }
  }, [user?.uid, handleSelectLocation, navigate, stopPolling])

  const startPolling = useCallback(() => {
    stopPolling()
    setLocationsLoading(true)
    setLocationsError(null)

    // Maximum 60s timeout
    maxTimeoutRef.current = setTimeout(() => {
      stopPolling()
      setLocationsLoading(false)
      setLocationsError({
        type: 'error',
        message: 'Unable to load Google Business Profile data within the timeout period. Please try reconnecting.'
      })
    }, 60000)

    // Poll every 2.5s
    pollTimerRef.current = setInterval(async () => {
      const isFinished = await loadOnboardingSession(null)
      if (isFinished) {
        stopPolling()
      }
    }, 2500)
  }, [loadOnboardingSession, stopPolling])

  useEffect(() => {
    return () => {
      stopPolling()
    }
  }, [stopPolling])

  // Recover the Google connection + selected outlet after a page refresh.
  useEffect(() => {
    if (user?.uid) {
      loadOnboardingSession(null)
    }
  }, [user?.uid, loadOnboardingSession])

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setValidatingDiscount(true);
    try {
      const { data } = await apiClient.post('/api/discounts/validate', { code: discountCode });
      if (data.valid) {
        setDiscountData(data.discount);
        toast.success('Discount applied!');
      }
    } catch (err) {
      setDiscountData(null);
      toast.error(err?.response?.data?.error || 'Invalid discount code');
    } finally {
      setValidatingDiscount(false);
    }
  }

  const handleRemoveDiscount = () => {
    setDiscountCode('');
    setDiscountData(null);
  }

  useEffect(() => {
    if (profile?.outletId && profile?.isSetupComplete) {
      navigate('/outlet-dashboard')
    }
  }, [profile, navigate])

  useEffect(() => {
    const handleMessage = async (event) => {
      // Security: only accept messages from the known backend origin (OAuth popup host).
      const allowedOrigins = getOAuthMessageOrigins()
      if (!allowedOrigins.includes(event.origin)) {
        console.warn('[Onboarding] ignoring postMessage from unexpected origin:', event.origin)
        return
      }

      if (event.data?.type === 'gmb-connected') {
        toast.success('Google My Business connected successfully!')
        setShowDisclosureModal(true)
        stopPolling()
        await loadOnboardingSession(event.data.googleLocations)
      } else if (event.data?.type === 'gmb-error') {
        stopPolling()
        setLocationsLoading(false)
        setLocationsError({ type: 'error', message: event.data.error || 'Google connection failed.' })
        toast.error(`Google Connection failed: ${event.data.error}`)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [loadOnboardingSession, stopPolling])

  const handleConnectGoogle = () => {
    if (!user?.uid) {
      toast.error('Please sign in again before connecting Google.')
      return
    }

    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const url = buildOAuthUrl('/api/auth/google/onboard', { uid: user.uid })

    window.open(url, 'Connect GMB', `width=${width},height=${height},left=${left},top=${top}`)
    startPolling()
  }

  const handleNextStep = (e) => {
    e.preventDefault()
    if (!googleConnected || !form.placeId) {
      toast.error('Please connect your Google My Business account and select a location.')
      return
    }

    const localPhone = (form.primaryWhatsAppNumber || form.managerPhone || '').trim()
    if (localPhone.includes('+') || /^(\+?\d{1,4})\d{10,}$/.test(localPhone)) {
      toast.error('Please enter only your local mobile number without adding the country code again.')
      return
    }

    const cleaned = localPhone.replace(/\D/g, '')
    if (cleaned.length < 7 || cleaned.length > 12) {
      toast.error('Please enter a valid local WhatsApp mobile number (7-12 digits).')
      return
    }

    if (step === 1 && form.businessName && form.businessType && localPhone) {
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
        discountData,
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
      const subscription = await createSubscription(tempCustomerId, form.planId, discountData?.code)

      if (!subscription.razorpayKeyId || subscription.razorpayKeyId === 'rzp_test_dummy' || subscription.id.startsWith('sub_mock_')) {
        throw new Error('Unable to start payment because the selected subscription plan is not configured correctly on the server.')
      }

      const options = {
        key: subscription.razorpayKeyId,
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
    <div className="flex min-h-screen bg-slatey-50 items-center justify-center p-2 sm:p-4">
      <Seo
        title="Create Account | One Repute"
        description="Set up your One Repute workspace and start your free trial for AI-powered Google review management."
        path="/onboarding"
        noindex
      />
      <div className="w-full max-w-4xl grid md:grid-cols-5 bg-white rounded-3xl shadow-2xl overflow-hidden border border-slatey-100">
        
        {/* Left Sidebar Steps */}
        <div className="hidden md:block col-span-2 bg-brand-600 p-8 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-white via-transparent to-transparent"></div>
          <div className="relative z-10 mb-6">
            <Logo size="lg" to="/" />
          </div>
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
        <div className="col-span-3 p-5 sm:p-8 md:p-12 relative">
          <div className="md:hidden flex items-center justify-between mb-6 pb-4 border-b border-slatey-100">
            <Logo size="sm" to="/" />
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full">Step {step} of 2</span>
          </div>
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
                  {locationsLoading ? (
                    <div className="flex items-center justify-center gap-3 rounded-2xl border border-slatey-200 bg-slatey-50 p-6 text-sm text-slatey-500">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />
                      Loading your Google Business Profile data…
                    </div>
                  ) : !googleConnected ? (
                    <div className="space-y-3 rounded-2xl border border-slatey-200 bg-slatey-50 p-5 text-center">
                      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                        <Store className="h-6 w-6 text-brand-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slatey-800">Connect Google My Business</h3>
                        <p className="mt-1 text-xs text-slatey-500">Sign in to fetch your business locations and start replying to reviews.</p>
                      </div>
                      <Button type="button" onClick={handleConnectGoogle} className="w-full shadow-brand mt-2">
                        Sign in with Google
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {gmbLocations.length > 0 ? (
                        <>
                          <label className="text-xs font-semibold text-slatey-700 ml-1">Select Business Location</label>
                          <select
                            className="w-full h-12 rounded-xl border border-slatey-200 bg-slatey-50 px-4 text-sm text-slatey-700 outline-none transition focus:border-brand-400 focus:bg-white"
                            value={form.placeId}
                            onChange={(e) => handleSelectLocation(e.target.value)}
                            required
                          >
                            <option value="" disabled>-- Select a location --</option>
                            {gmbLocations.map(loc => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </>
                      ) : (
                        <div className="space-y-3">
                          <div className={`rounded-xl border p-4 text-sm ${
                            locationsError?.type === 'error'
                              ? 'border-rose-200 bg-rose-50 text-rose-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}>
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                              <div>
                                <p className="font-semibold">
                                  {locationsError ? 'Google connection needs attention' : 'No locations found in this Google Account'}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed">
                                  {locationsError?.message || 'Please ensure you manage a Google Business Profile.'}
                                </p>
                              </div>
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => loadOnboardingSession(null)}
                                className="bg-white"
                              >
                                <RefreshCw className="h-3.5 w-3.5" /> Retry
                              </Button>
                              <Button type="button" variant="outline" size="sm" onClick={handleConnectGoogle} className="bg-white">
                                Reconnect Google
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!googleConnected && (
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
                  )}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slatey-700 ml-1">Business Category</label>
                      <span className="text-[10px] font-bold text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-100">
                        Fetched from GMB: Read Only
                      </span>
                    </div>
                    <Input
                      value={form.businessType || 'General Business'}
                      readOnly
                      disabled
                      className="h-12 bg-slatey-100/70 text-slatey-600 font-medium cursor-not-allowed border-slatey-200"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slatey-700 ml-1">Primary WhatsApp Number</label>
                    <div className="flex gap-2">
                      <div className="w-32 shrink-0">
                        <select
                          value={form.countryCode || '+91'}
                          onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
                          className="w-full h-12 rounded-xl border border-slatey-200 bg-slatey-50 px-3 text-sm font-semibold text-slatey-800 outline-none transition focus:border-brand-400 focus:bg-white"
                        >
                          <option value="+91">🇮🇳 +91</option>
                          <option value="+1">🇺🇸 +1</option>
                          <option value="+44">🇬🇧 +44</option>
                          <option value="+971">🇦🇪 +971</option>
                          <option value="+49">🇩🇪 +49</option>
                          <option value="+33">🇫🇷 +33</option>
                          <option value="+61">🇦🇺 +61</option>
                          <option value="+81">🇯🇵 +81</option>
                          <option value="+65">🇸🇬 +65</option>
                          <option value="+966">🇸🇦 +966</option>
                        </select>
                      </div>
                      <div className="flex-1">
                        <Input
                          type="tel"
                          placeholder="Local WhatsApp number"
                          value={form.primaryWhatsAppNumber}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val.startsWith('+')) {
                              toast.error('Do not enter country code inside local number field. Select country code from dropdown.')
                              return
                            }
                            setForm({ ...form, primaryWhatsAppNumber: val.replace(/\D/g, ''), managerPhone: val.replace(/\D/g, '') })
                          }}
                          required
                          className="h-12 bg-slatey-50"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-slatey-400 ml-1">Primary WhatsApp contact for 1st level escalation alerts. Enter local number only.</p>
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
                  {PLANS.map(plan => {
                    const regionConfig = PRICING_CONFIG.regions.IN
                    const planPrices = regionConfig.plans[plan.id] || {}
                    const priceAmount = planPrices.monthly || 0
                    const formattedPrice = formatPrice(priceAmount, regionConfig)

                    return (
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
                            {discountData && form.planId === plan.id ? (
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-slatey-400 line-through">{formattedPrice}</span>
                                <span className="text-xl font-bold text-brand-600">
                                  {discountData.type === 'Percentage' 
                                    ? formatPrice(priceAmount * (1 - discountData.value / 100), regionConfig)
                                    : formatPrice(Math.max(0, priceAmount - discountData.value), regionConfig)}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xl font-bold text-brand-600">{formattedPrice}</span>
                            )}
                            <span className="text-xs text-slatey-500">/mo</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                <div className="mt-6 p-4 rounded-xl border border-slatey-200 bg-slatey-50 flex flex-col gap-3">
                  <label className="text-xs font-semibold text-slatey-700">Have a discount code?</label>
                  {!discountData ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slatey-400" />
                        <Input 
                          placeholder="Enter code" 
                          value={discountCode} 
                          onChange={(e) => setDiscountCode(e.target.value)} 
                          className="pl-9 h-10 bg-white"
                        />
                      </div>
                      <Button variant="outline" size="sm" onClick={handleApplyDiscount} disabled={validatingDiscount || !discountCode.trim()} className="h-10">
                        {validatingDiscount ? 'Validating...' : 'Apply'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-50 border border-emerald-100">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-sm font-bold text-emerald-800">{discountData.code} Applied</span>
                        <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded">
                          {discountData.type === 'Percentage' ? `${discountData.value}% OFF` : `$${discountData.value} OFF`}
                        </span>
                      </div>
                      <button onClick={handleRemoveDiscount} className="text-emerald-700 hover:text-emerald-900 p-1">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
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
      <AutoResponseDisclosureModal
        isOpen={showDisclosureModal}
        onClose={() => setShowDisclosureModal(false)}
        onConfirm={() => setShowDisclosureModal(false)}
      />
    </div>
  )
}
