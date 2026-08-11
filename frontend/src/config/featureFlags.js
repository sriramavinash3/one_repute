/**
 * Central feature flags for the OneRepute frontend.
 *
 * Set a flag to `false` to temporarily lock a feature across the app
 * (navigation + direct URLs) without touching feature code.
 * To re-enable a feature, set the flag back to `true` (or remove the
 * lock conditions that read it).
 */
export const FEATURE_FLAGS = {
  // Locked: "Smart QR Code Campaigns will be updated soon. Stay tuned."
  SMART_QR_CAMPAIGNS: false,
}
