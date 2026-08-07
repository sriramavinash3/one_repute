import { useMemo, useState, useEffect } from 'react'
import { PRICING_CONFIG, formatPrice } from './pricingConfig'
import { useAuth } from '../../contexts/AuthContext'
import { PricingContext } from './usePricing'

export function CountryPricingProvider({ children }) {
  const authState = useAuth() || {}
  const outlet = authState.outlet || null
  const [overrideRegion, setOverrideRegion] = useState(null)
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [detectedRegion, setDetectedRegion] = useState('IN')

  useEffect(() => {
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
          const response = await fetch('/api/payments/detect-location')
          if (response.ok) {
            const data = await response.json()
            if (data.country === 'IN') {
              setDetectedRegion('IN')
            } else {
              setDetectedRegion('INT')
            }
          }
        } catch (err) {
          setDetectedRegion('IN')
        }
      }
      detect()
    }
  }, [outlet])

  const region = overrideRegion || detectedRegion

  const regionConfig = useMemo(() => {
    return PRICING_CONFIG.regions[region] || PRICING_CONFIG.regions.INT
  }, [region])

  /**
   * Calculate price details for a given plan ID and current billing cycle.
   */
  const getPlanPricing = useMemo(() => {
    return (planId) => {
      const planPrices = regionConfig.plans[planId] || { monthly: 0, quarterly: 0, annual: 0 }
      const original = planPrices[billingCycle] || 0

      const isDiscounted = billingCycle === 'quarterly' || billingCycle === 'annual'
      const discountPercent = isDiscounted ? PRICING_CONFIG.discountPercent : 0
      const discounted = isDiscounted
        ? Math.round(original * (1 - discountPercent / 100))
        : original

      return {
        originalAmount: original,
        discountedAmount: discounted,
        formattedOriginal: formatPrice(original, regionConfig),
        formattedDiscounted: formatPrice(discounted, regionConfig),
        isDiscounted,
        discountPercent,
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
      setRegion: setOverrideRegion,
      billingCycle,
      setBillingCycle,
      regionConfig,
      getPlanPricing,
      pricingConfig: PRICING_CONFIG,
      isAutoDetected: Boolean(outlet?.country || outlet?.googleLocationCountry),
    }),
    [region, billingCycle, regionConfig, getPlanPricing, outlet]
  )

  return <PricingContext.Provider value={value}>{children}</PricingContext.Provider>
}
