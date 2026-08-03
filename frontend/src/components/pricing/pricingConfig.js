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
          monthly: 1299,
          quarterly: 3899,
          annual: 15599,
        },
        growth: {
          monthly: 1999,
          quarterly: 4999,
          annual: 17999,
        },
        premium: {
          monthly: 2999,
          quarterly: 7999,
          annual: 25999,
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
          monthly: 25,
          quarterly: 75,
          annual: 279,
        },
        growth: {
          monthly: 29,
          quarterly: 79,
          annual: 289,
        },
        premium: {
          monthly: 34,
          quarterly: 99,
          annual: 349,
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
