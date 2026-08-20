import { createContext, useContext, useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import apiClient from '../services/apiClient'
import { toast } from 'sonner'

const SubscriptionContext = createContext(null)

export function SubscriptionProvider({ children }) {
  const { user, profile, outlet } = useAuth()
  const [billingInfo, setBillingInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchBillingInfo = async () => {
    if (!user) {
      setBillingInfo(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data } = await apiClient.get('/api/payments/billing-info')
      setBillingInfo(data)
    } catch (err) {
      console.error('Failed to load billing info:', err)
      setError('Failed to load subscription details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBillingInfo()
  }, [user, profile?.customerId, outlet?.id])

  // Helper function to map planId to features locally if not fully loaded from API
  const getFeatureValue = (featureKey) => {
    if (!billingInfo?.subscription) return null
    
    // 1. Get current plan feature list
    const currentPlanId = billingInfo.subscription.plan || 'plan_starter'
    const isTrial = billingInfo.subscription.status === 'trialing' || currentPlanId === 'trial' || billingInfo.usage?.isTrialActive

    // Starter fallback features (Trial users get Starter-level feature access)
    const STARTER_FEATURES = {
      monthly_review_responses: isTrial ? 30 : 100,
      google_auto_reply: true,
      ai_low_rating_reply: true,
      positive_review_reply: true,
      whatsapp_escalation_levels: 1,
      smart_qr: false,
      sentiment_analysis: 'basic',
      review_dashboard: 'basic',
      monthly_report: 'comprehensive_summary',
      keyword_tracking: false,
      competitor_tracking: 0,
      multi_user_access: 2,
      reply_approval_mode: false,
      escalation_matrix_levels: 1,
      review_trend_insights: false,
      low_rating_pattern_detection: false,
      customer_issue_categories: false,
      monthly_strategy_call: false,
      support_priority: 'standard'
    }

    const GROWTH_FEATURES = {
      monthly_review_responses: 250,
      google_auto_reply: true,
      ai_low_rating_reply: true,
      positive_review_reply: true,
      whatsapp_escalation_levels: 2,
      smart_qr: true,
      sentiment_analysis: 'standard',
      review_dashboard: 'full',
      monthly_report: 'detailed_sentiment',
      keyword_tracking: true,
      competitor_tracking: 2,
      multi_user_access: 3,
      reply_approval_mode: false,
      escalation_matrix_levels: 2,
      review_trend_insights: true,
      low_rating_pattern_detection: 'basic',
      customer_issue_categories: true,
      monthly_strategy_call: false,
      support_priority: 'priority'
    }

    const PREMIUM_FEATURES = {
      monthly_review_responses: 500,
      google_auto_reply: true,
      ai_low_rating_reply: true,
      positive_review_reply: true,
      whatsapp_escalation_levels: 3,
      smart_qr: true,
      sentiment_analysis: 'advanced',
      review_dashboard: 'advanced',
      monthly_report: 'strategy_ai_action',
      keyword_tracking: true,
      competitor_tracking: 5,
      multi_user_access: 5,
      reply_approval_mode: true,
      escalation_matrix_levels: 3,
      review_trend_insights: true,
      low_rating_pattern_detection: 'advanced',
      customer_issue_categories: true,
      monthly_strategy_call: true,
      support_priority: 'premium'
    }

    let activeFeatures = STARTER_FEATURES
    if (currentPlanId === 'plan_growth') activeFeatures = GROWTH_FEATURES
    if (currentPlanId === 'plan_premium') activeFeatures = PREMIUM_FEATURES

    return activeFeatures[featureKey] !== undefined ? activeFeatures[featureKey] : null
  }

  const hasFeature = (featureKey) => {
    const val = getFeatureValue(featureKey)
    if (typeof val === 'boolean') return val
    return val !== null && val !== undefined
  }

  const getLimit = (featureKey) => {
    return getFeatureValue(featureKey)
  }

  const remainingLimit = (featureKey) => {
    const limit = getLimit(featureKey)
    if (typeof limit !== 'number') {
      return hasFeature(featureKey) ? Infinity : 0
    }

    let used = 0
    if (!billingInfo?.usage) return limit

    const isTrial = billingInfo.subscription?.status === 'trialing' || billingInfo.subscription?.plan === 'trial' || billingInfo.usage?.isTrialActive

    if (featureKey === 'monthly_review_responses') {
      used = isTrial
        ? (billingInfo.usage.trialResponsesUsed ?? billingInfo.usage.trialSuggestionsUsed ?? 0)
        : (billingInfo.usage.repliesUsed || 0)
    } else if (featureKey === 'competitor_tracking') {
      used = billingInfo.usage.competitorsUsed || 0
    } else if (featureKey === 'multi_user_access') {
      used = billingInfo.usage.usersUsed || 0
    } else if (featureKey === 'smart_qr') {
      used = billingInfo.usage.qrsUsed || 0
    }

    return Math.max(0, limit - used)
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if (window.Razorpay) {
        resolve(true)
        return
      }
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const checkoutSubscription = async (planId, billingCycle = 'monthly') => {
    setLoading(true)
    try {
      const isScriptLoaded = await loadRazorpayScript()
      if (!isScriptLoaded) {
        throw new Error('Razorpay SDK failed to load. Are you online?')
      }

      // Create subscription on the backend
      const { data: subscription } = await apiClient.post('/api/payments/create-subscription', {
        planId,
        billingCycle,
        countryCode: billingInfo?.subscription?.billingCountry || 'IN',
        customerId: profile?.customerId,
        skipTrial: true,
      })

      if (!subscription.razorpayKeyId || subscription.id?.startsWith('sub_mock_')) {
        throw new Error('Unable to start payment because the selected subscription plan is not configured correctly on the server.')
      }

      // Live / Test Mode Checkout Modal via window.Razorpay
      return new Promise((resolve) => {
        const options = {
          key: subscription.razorpayKeyId,
          subscription_id: subscription.id,
          name: 'OneRepute',
          description: `${planId.replace('plan_', '').toUpperCase()} Subscription (${billingCycle})`,
          handler: async function (response) {
            try {
              await apiClient.post('/api/payments/verify', {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                razorpay_subscription_id: response.razorpay_subscription_id
              })
              toast.success('Subscription payment verified and plan activated successfully!')
              await fetchBillingInfo()
              resolve(true)
            } catch (err) {
              console.error(err)
              toast.error(err.response?.data?.error || 'Payment signature verification failed.')
              resolve(false)
            } finally {
              setLoading(false)
            }
          },
          modal: {
            ondismiss: function () {
              setLoading(false)
              toast.info('Payment checkout cancelled.')
              resolve(false)
            }
          },
          prefill: {
            name: profile?.businessName || profile?.name || '',
            email: user?.email || '',
          },
          theme: {
            color: '#4f46e5'
          }
        }

        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', function (response) {
          toast.error(response.error?.description || 'Payment failed')
          setLoading(false)
          resolve(false)
        })
        rzp.open()
      })
    } catch (err) {
      console.error('Checkout failed:', err)
      toast.error(err.response?.data?.error || err.message || 'Payment checkout initialization failed')
      setLoading(false)
      return false
    }
  }

  const changePlan = async (newPlanId, billingCycle = 'monthly') => {
    try {
      const { data } = await apiClient.post('/api/payments/change-plan', { newPlanId, billingCycle })
      toast.success(data.message || 'Plan updated successfully')
      await fetchBillingInfo()
      return true
    } catch (err) {
      console.error(err)
      toast.error(err.response?.data?.error || 'Failed to update plan')
      return false
    }
  }

  const cancelSubscription = async () => {
    try {
      const { data } = await apiClient.post('/api/payments/cancel')
      toast.success(data.message || 'Subscription cancelled successfully')
      await fetchBillingInfo()
      return true
    } catch (err) {
      console.error(err)
      toast.error('Failed to cancel subscription')
      return false
    }
  }

  const resumeSubscription = async () => {
    try {
      const { data } = await apiClient.post('/api/payments/resume')
      toast.success(data.message || 'Subscription resumed successfully')
      await fetchBillingInfo()
      return true
    } catch (err) {
      console.error(err)
      toast.error('Failed to resume subscription')
      return false
    }
  }

  return (
    <SubscriptionContext.Provider
      value={{
        billingInfo,
        loading,
        error,
        refetch: fetchBillingInfo,
        hasFeature,
        getLimit,
        remainingLimit,
        changePlan,
        checkoutSubscription,
        cancelSubscription,
        resumeSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  )
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider')
  }
  return context
}
