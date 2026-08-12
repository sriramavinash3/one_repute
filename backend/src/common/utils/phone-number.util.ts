/**
 * src/common/utils/phone-number.util.ts
 *
 * Shared phone-number normalization used by both AutomationService
 * and WhatsAppService. Extracted here to break the circular import
 * between whatsapp.service.ts and automation.service.ts.
 */

export function normalizePhoneNumber(rawPhone: string, defaultCc = '+91'): string {
  if (!rawPhone) return '';
  let cleaned = String(rawPhone).trim().replace(/[\s\-\(\)]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  const cc = defaultCc.startsWith('+') ? defaultCc : `+${defaultCc}`;
  return `${cc}${cleaned}`;
}