import { createContext, useContext } from 'react'

export const PricingContext = createContext(null)

export function usePricing() {
  const context = useContext(PricingContext)
  if (!context) {
    throw new Error('usePricing must be used within a CountryPricingProvider')
  }
  return context
}
