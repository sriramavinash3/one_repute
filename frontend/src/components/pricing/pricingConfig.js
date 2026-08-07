export const PRICING_CONFIG = {
  discountPercent: 20,
  couponCode: 'LAUNCH20',
  defaultRegion: 'INT',
  regions: {
    IN: {
      id: 'IN',
      name: 'India',
      currencySymbol: '₹',
      currencyCode: 'INR',
      locale: 'en-IN',
      plans: {
        starter: {
          monthly: 999,
          annual: 9999,
        },
        growth: {
          monthly: 1999,
          annual: 19999,
        },
        premium: {
          monthly: 2999,
          annual: 29999,
        },
      },
    },
    INT: {
      id: 'INT',
      name: 'International',
      currencySymbol: '$',
      currencyCode: 'USD',
      locale: 'en-US',
      plans: {
        starter: {
          monthly: 29,
          annual: 290,
        },
        growth: {
          monthly: 79,
          annual: 790,
        },
        premium: {
          monthly: 199,
          annual: 1990,
        },
      },
    },
  },
  plansInfo: [
    {
      id: 'starter',
      name: 'Starter',
      tagline: 'Essential AI review management for single outlets.',
      isPopular: false,
    },
    {
      id: 'growth',
      name: 'Growth',
      tagline: 'Advanced automation and insights for expanding brands.',
      isPopular: true,
    },
    {
      id: 'premium',
      name: 'Premium',
      tagline: 'Enterprise-grade reputation control for multi-chain outlets.',
      isPopular: false,
    },
  ],
}

/**
 * Format price number based on currency and locale.
 * No decimals, locale formatting.
 */
export function formatPrice(amount, regionConfig) {
  if (amount == null) return ''
  const formattedNumber = Math.round(amount).toLocaleString(regionConfig.locale)
  return `${regionConfig.currencySymbol}${formattedNumber}`
}
