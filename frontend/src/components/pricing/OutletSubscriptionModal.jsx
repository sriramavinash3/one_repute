import { useState } from 'react'
import { X, CheckCircle2, Store, CreditCard, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import Button from '../ui/button'
import { loadRazorpayScript, createSubscription } from '../../services/paymentService'
import apiClient from '../../services/apiClient'
import { PRICING_CONFIG, formatPrice } from './pricingConfig'
import { useAuth } from '../../contexts/AuthContext'
import { useSubscription } from '../../contexts/SubscriptionContext'

const PLANS = [
  {
    id: 'plan_starter',
    name: 'Starter',
    description: 'Essential review automation for single outlet.',
    monthlyPrice: PRICING_CONFIG.regions.IN.plans.starter.monthly,
  },
  {
    id: 'plan_growth',
    name: 'Growth',
    description: 'Advanced AI replies and WhatsApp escalations.',
    monthlyPrice: PRICING_CONFIG.regions.IN.plans.growth.monthly,
    recommended: true,
  },
  {
    id: 'plan_premium',
    name: 'Premium',
    description: 'Priority monitoring, competitor tracking & strategy support.',
    monthlyPrice: PRICING_CONFIG.regions.IN.plans.premium.monthly,
  },
]

export default function OutletSubscriptionModal({ isOpen, location, user, onClose, onSuccess }) {
  const [selectedPlanId, setSelectedPlanId] = useState('plan_growth')
  const [loading, setLoading] = useState(false)
  const { switchOutlet, refreshUserAndOutlets } = useAuth()
  const { refetch: refetchSubscription } = useSubscription()

  if (!isOpen || !location) return null

  const handleSubscribeAndRegister = async (isTrial = false) => {
    setLoading(true)
    try {
      if (isTrial) {
        // Direct server-side trial registration for new outlet
        const { data } = await apiClient.post('/api/payments/verify-and-provision-outlet', {
          planId: selectedPlanId,
          location,
          isTrial: true,
        })

        if (data.success && data.outletId) {
          toast.success(`Outlet "${location.name}" registered with 15-day trial!`)
          if (switchOutlet) {
            await switchOutlet(data.outletId)
          }
          if (refreshUserAndOutlets) {
            await refreshUserAndOutlets(data.outletId)
          }
          if (refetchSubscription) {
            await refetchSubscription()
          }
          if (onSuccess) {
            onSuccess(data.outletId)
          } else if (onClose) {
            onClose()
          }
        } else {
          throw new Error(data.error || 'Failed to register outlet.')
        }
      } else {
        // Paid checkout flow via Razorpay
        const isLoaded = await loadRazorpayScript()
        if (!isLoaded) {
          throw new Error('Razorpay SDK failed to load. Please check your internet connection.')
        }

        const subscription = await createSubscription(selectedPlanId, 'monthly', 'IN', user?.customerId)

        if (!subscription.razorpayKeyId || subscription.razorpayKeyId === 'rzp_test_dummy' || subscription.id.startsWith('sub_mock_')) {
          throw new Error('Selected plan is not configured correctly for payment.')
        }

        const options = {
          key: subscription.razorpayKeyId,
          subscription_id: subscription.id,
          name: 'One Repute',
          description: `Subscription for ${location.name}`,
          handler: async function (response) {
            try {
              const { data } = await apiClient.post('/api/payments/verify-and-provision-outlet', {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                razorpay_subscription_id: response.razorpay_subscription_id,
                planId: selectedPlanId,
                location,
                isTrial: false,
              })

              if (data.success && data.outletId) {
                toast.success(`Outlet "${location.name}" subscription activated!`)
                if (switchOutlet) {
                  await switchOutlet(data.outletId)
                }
                if (refreshUserAndOutlets) {
                  await refreshUserAndOutlets(data.outletId)
                }
                if (refetchSubscription) {
                  await refetchSubscription()
                }
                if (onSuccess) {
                  onSuccess(data.outletId)
                } else if (onClose) {
                  onClose()
                }
              } else {
                toast.error('Outlet activation failed after payment.')
              }

            } catch (err) {
              toast.error(err?.response?.data?.error || err.message || 'Payment verification failed.')
            } finally {
              setLoading(false)
            }
          },
          prefill: {
            name: location.name,
            email: user?.email || '',
          },
          theme: {
            color: '#4f46e5',
          },
        }

        const rzp = new window.Razorpay(options)
        rzp.on('payment.failed', function (resp) {
          toast.error(resp.error.description)
          setLoading(false)
        })
        rzp.open()
      }
    } catch (error) {
      toast.error(error.message || 'Subscription failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slatey-900/60 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-3xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-slatey-900 border border-slatey-100 dark:border-slatey-800 my-8">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-slatey-400 hover:bg-slatey-100 hover:text-slatey-600 dark:hover:bg-slatey-800"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-950/40">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full">
              New Outlet Registration
            </span>
            <h2 className="text-xl font-bold text-slatey-900 dark:text-white">
              {location.name}
            </h2>
            <p className="text-xs text-slatey-500">{location.address || 'Google Business Location'}</p>
          </div>
        </div>

        <p className="text-xs text-slatey-600 dark:text-slatey-400 mb-6">
          This Google Business Profile exists in your account but is not yet registered on OneRepute. Select a plan below to activate this outlet.
        </p>

        <div className="space-y-3 mb-6">
          {PLANS.map((plan) => {
            const isSelected = selectedPlanId === plan.id
            return (
              <div
                key={plan.id}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`relative cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-50/60 dark:bg-brand-950/30 shadow-sm'
                    : 'border-slatey-200 dark:border-slatey-800 hover:border-brand-300'
                }`}
              >
                {plan.recommended && (
                  <span className="absolute -top-2.5 right-4 bg-brand-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Recommended
                  </span>
                )}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-brand-600 bg-brand-600 text-white' : 'border-slatey-300'}`}>
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-slatey-900 dark:text-white text-sm">{plan.name}</h4>
                      <p className="text-xs text-slatey-500">{plan.description}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-brand-600">₹{plan.monthlyPrice}</span>
                    <span className="text-[10px] text-slatey-400">/mo</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full h-12 shadow-brand bg-brand-600 text-white hover:bg-brand-700 font-semibold flex items-center justify-center gap-2"
            onClick={() => handleSubscribeAndRegister(false)}
            disabled={loading}
          >
            <CreditCard className="h-4 w-4" />
            {loading ? 'Processing...' : 'Subscribe & Activate Outlet'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="w-full h-10 text-slatey-600 dark:text-slatey-300 border-slatey-200"
            onClick={() => handleSubscribeAndRegister(true)}
            disabled={loading}
          >
            <Sparkles className="h-4 w-4 mr-2 text-brand-500" />
            Start 15-Day Free Trial
          </Button>
        </div>
      </div>
    </div>
  )
}
