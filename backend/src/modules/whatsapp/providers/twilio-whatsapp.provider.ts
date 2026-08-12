import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppProvider, WhatsAppTextPayload, WhatsAppTemplatePayload, WhatsAppSendResult } from '../interfaces/whatsapp-provider.interface';

/**
 * Validates whether a StatusCallback URL meets Twilio's requirements:
 * - Must be an absolute public HTTPS URL
 * - Must contain a valid public hostname (no localhost, 127.0.0.1, or internal domain)
 * - Must not contain invalid hostname characters (e.g. underscores)
 * - Must not contain 'undefined' or 'null'
 * - Must be under 4000 characters
 */
export function validateStatusCallbackUrl(urlStr?: string): { valid: boolean; reason?: string } {
  if (!urlStr || typeof urlStr !== 'string' || urlStr.trim() === '') {
    return { valid: false, reason: 'StatusCallback URL is missing or empty' };
  }

  const trimmed = urlStr.trim();

  if (trimmed.length > 4000) {
    return { valid: false, reason: 'StatusCallback URL exceeds 4000 characters limit' };
  }

  if (trimmed.includes('undefined') || trimmed.includes('null')) {
    return { valid: false, reason: 'StatusCallback URL contains "undefined" or "null"' };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, reason: `StatusCallback URL '${trimmed}' is not a valid absolute URL` };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, reason: `Invalid protocol '${parsed.protocol}'. Twilio StatusCallback requires HTTPS` };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname === '::1'
  ) {
    return { valid: false, reason: `Host '${hostname}' is private/local and not accessible by Twilio` };
  }

  if (
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.test') ||
    hostname.endsWith('.invalid') ||
    hostname.endsWith('.localhost')
  ) {
    return { valid: false, reason: `Host '${hostname}' is an internal domain not accessible by Twilio` };
  }

  if (!hostname.includes('.')) {
    return { valid: false, reason: `Hostname '${hostname}' must be a fully qualified public domain name` };
  }

  if (/[_]/.test(hostname)) {
    return { valid: false, reason: `Hostname '${hostname}' contains invalid character '_'` };
  }

  return { valid: true };
}

@Injectable()
export class TwilioWhatsAppProvider implements IWhatsAppProvider {
  readonly providerName = 'twilio';
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from: string;
  private readonly messagingServiceSid: string;
  private twilioClient: any = null;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID') || '';
    this.authToken = this.config.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.from = this.config.get<string>('TWILIO_WHATSAPP_FROM') || '';
    this.messagingServiceSid = this.config.get<string>('TWILIO_MESSAGING_SERVICE_SID') || '';
  }

  private getClient(): any {
    if (!this.twilioClient) {
      if (!this.isAvailable()) {
        throw new Error('Twilio credentials not configured. Please check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM or TWILIO_MESSAGING_SERVICE_SID.');
      }
      const twilio = require('twilio');
      this.twilioClient = twilio(this.accountSid, this.authToken);
    }
    return this.twilioClient;
  }

  isAvailable(): boolean {
    const hasSender = Boolean((this.from && this.from.trim() !== '') || (this.messagingServiceSid && this.messagingServiceSid.trim() !== ''));
    return Boolean(
      this.accountSid &&
      this.accountSid.trim() !== '' &&
      this.authToken &&
      this.authToken.trim() !== '' &&
      hasSender
    );
  }

  async sendText(payload: WhatsAppTextPayload): Promise<WhatsAppSendResult> {
    const client = this.getClient();
    const cleanTo = payload.to.replace('whatsapp:', '').trim();

    // Validate phone E.164 format
    if (!/^\+[1-9]\d{1,14}$/.test(cleanTo)) {
      throw new Error(`Invalid WhatsApp recipient phone number '${payload.to}'. Must be in valid E.164 format (e.g. +919876543210).`);
    }

    const normalizedTo = `whatsapp:${cleanTo}`;

    // Resolve canonical StatusCallback URL
    const explicitCallback = this.config.get<string>('TWILIO_STATUS_CALLBACK_URL');
    const publicApiUrl = this.config.get<string>('PUBLIC_API_URL') || this.config.get<string>('app.publicApiUrl');
    const appUrl = this.config.get<string>('APP_URL') || this.config.get<string>('app.appUrl');

    let resolvedCallbackUrl: string | undefined = explicitCallback;

    if (!resolvedCallbackUrl) {
      if (publicApiUrl) {
        resolvedCallbackUrl = `${publicApiUrl.replace(/\/+$/, '')}/api/whatsapp/twilio/callback`;
      } else if (appUrl && appUrl.startsWith('https://')) {
        resolvedCallbackUrl = `${appUrl.replace(/\/+$/, '')}/api/whatsapp/twilio/callback`;
      }
    }

    // Validate callback URL
    const validation = validateStatusCallbackUrl(resolvedCallbackUrl);
    this.logger.log(`[Twilio] StatusCallback: ${resolvedCallbackUrl || 'NONE'} | Valid: ${validation.valid}`);

    if (!validation.valid) {
      this.logger.error(`[Twilio] StatusCallback validation failed: ${validation.reason}`);
      throw new Error(
        `Twilio Configuration Error: Invalid StatusCallback URL (${validation.reason}). ` +
        `Please set PUBLIC_API_URL or TWILIO_STATUS_CALLBACK_URL to a valid public HTTPS endpoint (e.g. https://api.yourdomain.com).`
      );
    }

    const messageOptions: any = {
      body: payload.body,
      to: normalizedTo,
      statusCallback: resolvedCallbackUrl,
    };

    if (this.messagingServiceSid && this.messagingServiceSid.trim() !== '') {
      messageOptions.messagingServiceSid = this.messagingServiceSid.trim();
    } else {
      const normalizedFrom = this.from.startsWith('whatsapp:') ? this.from : `whatsapp:${this.from}`;
      messageOptions.from = normalizedFrom;
    }

    try {
      const msg = await client.messages.create(messageOptions);
      this.logger.log(`[Twilio] Message dispatched successfully: sid=${msg.sid}, status=${msg.status}, to=${normalizedTo}`);
      return { messageId: msg.sid, provider: this.providerName, status: msg.status };
    } catch (err: any) {
      const maskedSid = this.accountSid ? `${this.accountSid.slice(0, 6)}...` : 'NONE';
      this.logger.error(`[Twilio] Message dispatch failed to ${cleanTo} (AccountSID: ${maskedSid}): [Code ${err.code || 'UNKNOWN'}] ${err.message}`);
      throw new Error(`Twilio API Error [${err.code || 'FAIL'}]: ${err.message}`);
    }
  }

  async sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult> {
    // Twilio template message pattern (e.g. ContentSid)
    return this.sendText({ to: payload.to, body: `[Template: ${payload.templateName}]` });
  }
}
