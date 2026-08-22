import { useMemo, useState, useEffect, useCallback } from 'react'
import { PRICING_CONFIG, formatPrice } from './pricingConfig'
import { useAuth } from '../../contexts/AuthContext'
import { PricingContext } from './usePricing'
import apiClient from '../../services/apiClient'
import { INTERNATIONAL_BILLING_ENABLED } from '../../config/featureFlags'
import InternationalBillingModal from '../common/InternationalBillingModal'

export function CountryPricingProvider({ children }) {
  const authState = useAuth() || {}
  const outlet = authState.outlet || null
  const [overrideRegion, setOverrideRegion] = useState(null)
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [detectedRegion, setDetectedRegion] = useState('IN')
  const [showLockedModal, setShowLockedModal] = useState(false)

  useEffect(() => {
    if (!INTERNATIONAL_BILLING_ENABLED) {
      setDetectedRegion('IN')
      return
    }

    if (outlet) {
      const countryRaw = (
        outlet.country ||
        outlet.googleLocationCountry ||
        (typeof outlet.address === 'string' ? outlet.address : '') ||
        ''
      ).toLowerCase().trim()

      if (countryRaw.includes('india') || countryRaw === 'in') {
        setDetectedRegion('IN')
      } else {
        setDetectedRegion('INT')
      }
    } else {
      async function detect() {
        try {
          const { data } = await apiClient.get('/api/payments/detect-location')
          if (data && data.country === 'IN') {
            setDetectedRegion('IN')
          } else {
            setDetectedRegion('INT')
          }
        } catch (err) {
          setDetectedRegion('IN')
        }
      }
      detect()
    }
  }, [outlet])

  const handleSetRegion = useCallback((targetRegion) => {
    if (targetRegion === 'INT' && !INTERNATIONAL_BILLING_ENABLED) {
      setShowLockedModal(true)
      setOverrideRegion('IN')
      return
    }
    setOverrideRegion(targetRegion)
  }, [])

  const rawRegion = overrideRegion || detectedRegion
  const region = (!INTERNATIONAL_BILLING_ENABLED && rawRegion === 'INT') ? 'IN' : rawRegion

  const regionConfig = useMemo(() => {
    return PRICING_CONFIG.regions[region] || PRICING_CONFIG.regions.IN
  }, [region])

  /**
   * Calculate price details for a given plan ID and current billing cycle.
   */
  const getPlanPricing = useMemo(() => {
    return (planId) => {
      const planPrices = regionConfig.plans[planId] || { monthly: 0, quarterly: 0, annual: 0 }
      const amount = planPrices[billingCycle] ?? 0

      return {
        originalAmount: amount,
        discountedAmount: amount,
        formattedOriginal: formatPrice(amount, regionConfig),
        formattedDiscounted: formatPrice(amount, regionConfig),
        isDiscounted: false,
        discountPercent: 0,
        billingCycleLabel:
          billingCycle === 'monthly'
            ? '/ month'
            : billingCycle === 'quarterly'
            ? '/ quarter'
            : '/ year',
      }
    }
  }, [regionConfig, billingCycle])

  const value = useMemo(
    () => ({
      region,
      setRegion: handleSetRegion,
      billingCycle,
      setBillingCycle,
      regionConfig,
      getPlanPricing,
      pricingConfig: PRICING_CONFIG,
      isAutoDetected: Boolean(outlet?.country || outlet?.googleLocationCountry),
      triggerInternationalBillingModal: () => setShowLockedModal(true),
    }),
    [region, handleSetRegion, billingCycle, regionConfig, getPlanPricing, outlet]
  )

  return (
    <PricingContext.Provider value={value}>
      {children}
      <InternationalBillingModal
        isOpen={showLockedModal}
        onClose={() => setShowLockedModal(false)}
      />
    </PricingContext.Provider>
  )
}
