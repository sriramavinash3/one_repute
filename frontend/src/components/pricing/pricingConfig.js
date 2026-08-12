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
        plan_starter: {
          monthly: 1299,
          quarterly: 3899,
          annual: 15599,
        },
        plan_growth: {
          monthly: 1999,
          quarterly: 4999,
          annual: 17999,
        },
        plan_premium: {
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
          monthly: 29,
          quarterly: 79,
          annual: 339,
        },
        growth: {
          monthly: 39,
          quarterly: 109,
          annual: 399,
        },
        premium: {
          monthly: 49,
          quarterly: 139,
          annual: 499,
        },
        plan_starter: {
          monthly: 29,
          quarterly: 79,
          annual: 339,
        },
        plan_growth: {
          monthly: 39,
          quarterly: 109,
          annual: 399,
        },
        plan_premium: {
          monthly: 49,
          quarterly: 139,
          annual: 499,
        },
      },
    },
  },
  plansInfo: [
    {
      id: 'starter',
      planId: 'plan_starter',
      name: 'Starter',
      tagline: 'Essential AI review management for single outlets.',
      isPopular: false,
    },
    {
      id: 'growth',
      planId: 'plan_growth',
      name: 'Growth',
      tagline: 'Advanced automation and insights for expanding brands.',
      isPopular: true,
    },
    {
      id: 'premium',
      planId: 'plan_premium',
      name: 'Premium',
      tagline: 'Enterprise-grade reputation control for multi-chain outlets.',
      isPopular: false,
    },
  ],
}

export const PLAN_FEATURE_COMPARISON = [
  { feature: 'Monthly Review Responses', starter: '100 reviews', growth: '250 reviews', premium: '500 reviews' },
  { feature: 'Google Review Auto Reply', starter: true, growth: true, premium: true },
  { feature: '≤2 Star Review – AI Response', starter: true, growth: true, premium: true },
  { feature: 'Positive Review Replies', starter: true, growth: true, premium: true },
  { feature: 'WhatsApp Escalation Alert', starter: '1 Level', growth: '2 Levels', premium: '3 Levels' },
  { feature: 'Smart QR', starter: false, growth: true, premium: true },
  { feature: 'Sentiment Analysis', starter: 'Basic', growth: true, premium: 'Advanced' },
  { feature: 'Review Dashboard', starter: 'Basic', growth: 'Full Dashboard', premium: 'Advanced Dashboard' },
  { feature: 'Monthly Report', starter: 'Comprehensive Summary', growth: 'Detailed Report with Sentiment Analysis', premium: 'Strategy Report with Action Plan' },
  { feature: 'Keyword Tracking', starter: false, growth: true, premium: true },
  { feature: 'Competitor Tracking', starter: false, growth: 'Up to 2', premium: 'Up to 5' },
  { feature: 'Multi User Access', starter: '2 Users', growth: '3 Users', premium: '5 Users' },
  { feature: 'Reply Approval Mode', starter: false, growth: false, premium: true },
  { feature: 'Escalation Matrix', starter: '1 Step', growth: '2 Step', premium: '3 Step' },
  { feature: 'Review Trend Insights', starter: false, growth: true, premium: true },
  { feature: 'Low Rating Pattern Detection', starter: false, growth: 'Basic', premium: 'Advanced' },
  { feature: 'Customer Issue Categories', starter: false, growth: true, premium: true },
  { feature: 'Monthly Strategy Call', starter: false, growth: false, premium: true },
  { feature: 'Support Priority', starter: 'Standard', growth: 'Priority', premium: 'Premium' },
]

export const PLAN_CARD_FEATURES = {
  starter: {
    features: [
      '100 Monthly Review Responses',
      'Google Review Auto Reply',
      '≤2 Star Review AI Response',
      'Positive Review Replies',
      '1 Level WhatsApp Escalation',
      'Basic Sentiment Analysis',
      'Basic Dashboard & Comprehensive Report',
      '2 Team Members Limit',
    ],
    disabledFeatures: [
      'Smart QR Campaigns',
      'Competitor Tracking',
      'Reply Approval Mode',
      'Low Rating Pattern Detection',
      'Monthly Strategy Call',
    ],
  },
  growth: {
    features: [
      '250 Monthly Review Responses',
      'Google Review Auto Reply',
      '≤2 Star Review AI Response',
      'Positive Review Replies',
      '2 Levels WhatsApp Escalation',
      'Smart QR Campaigns',
      'Sentiment & Review Trend Insights',
      'Up to 2 Competitors Tracking',
      '3 Team Members Limit',
      'Customer Issue Categories',
    ],
    disabledFeatures: [
      'Reply Approval Mode',
      'Monthly Strategy Call',
      'Premium Support Priority',
    ],
  },
  premium: {
    features: [
      '500 Monthly Review Responses',
      'Google Review Auto Reply',
      '≤2 Star Review AI Response',
      'Positive Review Replies',
      '3 Levels WhatsApp Escalation',
      'Smart QR Campaigns',
      'Advanced Sentiment Analysis',
      'Up to 5 Competitors Tracking',
      '5 Team Members Limit',
      'Reply Approval Mode',
      'Low Rating Pattern Detection',
      'Monthly Strategy Call',
      'Premium Support Priority',
    ],
    disabledFeatures: [],
  },
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


