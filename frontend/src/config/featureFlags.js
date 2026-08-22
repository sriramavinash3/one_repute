/**
 * Centralized Feature Flags configuration for OneRepute Frontend.
 * Set INTERNATIONAL_BILLING_ENABLED to true when International Billing is officially launched.
 */
export const INTERNATIONAL_BILLING_ENABLED = false

export const FEATURE_FLAGS = {
  INTERNATIONAL_BILLING: INTERNATIONAL_BILLING_ENABLED,
  SMART_QR_CAMPAIGNS: true,
}

