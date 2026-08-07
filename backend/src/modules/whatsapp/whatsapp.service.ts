/**
 * src/modules/whatsapp/whatsapp.service.ts
 *
 * Provider-agnostic WhatsApp service.
 * Routes to the configured provider and provides all messaging functionality.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { Dialog360Provider } from './providers/dialog360.provider';
import { IWhatsAppProvider, WhatsAppSendResult } from './interfaces/whatsapp-provider.interface';

export interface NegativeReviewAlertParams {
  toNumber: string;
  outletName: string;
  rating: number;
  reviewText: string;
  customerName: string;
  aiSuggestedResponse?: string;
}

export interface EscalationAlertParams {
  toNumber: string;
  businessName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  pendingSince?: string;
  level: number;
  dashboardUrl?: string;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: IWhatsAppProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioWhatsAppProvider,
    private readonly dialog360Provider: Dialog360Provider,
  ) {
    const providerName = this.config.get<string>('WHATSAPP_PROVIDER') || 'twilio';
    if (providerName === '360dialog') {
      this.provider = this.dialog360Provider;
    } else {
      this.provider = this.twilioProvider;
    }
    this.logger.log(`[WhatsApp] Using provider: ${this.provider.providerName}`);
  }

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  /**
   * Send a negative review alert to the outlet manager.
   * Mirrors the legacy `sendNegativeReviewAlert` behavior exactly.
   */
  async sendNegativeReviewAlert(params: NegativeReviewAlertParams): Promise<WhatsAppSendResult | null> {
    if (!this.isAvailable()) {
      this.logger.warn('[WhatsApp] Provider not available — skipping negative review alert');
      return null;
    }

    const { toNumber, outletName, rating, reviewText, customerName, aiSuggestedResponse } = params;
    const stars = '⭐'.repeat(Math.max(1, rating)) + '☆'.repeat(Math.max(0, 5 - rating));
    const urgency = rating === 1 ? '🔴 URGENT' : rating === 2 ? '🟠 HIGH' : '🟡 MEDIUM';
    const suggestedSection = aiSuggestedResponse
      ? `---\n*💡 Suggested Reply:*\n"${aiSuggestedResponse}"\n\n`
      : '';

    const body = `🚨 *Negative Review Alert*

*Outlet:* ${outletName}
*Urgency:* ${urgency}
*Rating:* ${stars} (${rating}/5)
*Customer:* ${customerName}

*Review:*
"${reviewText || '(No comment provided)'}"

---
${suggestedSection}---
_Please review and respond via Google Business Profile._`;

    try {
      const result = await this.provider.sendText({ to: toNumber, body });
      this.logger.log('[WhatsApp] Negative review alert sent', { to: toNumber, outletName, rating });
      return result;
    } catch (err: any) {
      this.logger.error('[WhatsApp] Failed to send negative review alert', { error: err.message, to: toNumber });
      throw err;
    }
  }

  /**
   * Send an escalation alert to the responsible contact.
   * Mirrors the legacy `sendEscalationAlert` behavior exactly.
   */
  async sendEscalationAlert(params: EscalationAlertParams): Promise<WhatsAppSendResult | null> {
    if (!this.isAvailable()) {
      this.logger.warn('[WhatsApp] Provider not available — skipping escalation alert');
      return null;
    }

    const { toNumber, businessName, customerName, rating, reviewText, pendingSince, level, dashboardUrl } = params;
    const stars = '⭐'.repeat(Math.max(1, rating)) + '☆'.repeat(Math.max(0, 5 - rating));

    const body = `🚨 *Review Escalation Alert*

*Business:*
${businessName}

*Customer:*
${customerName}

*Rating:*
${stars} (${rating}/5)

*Review:*
"${reviewText || '(No comment provided)'}"

*Pending Since:*
${pendingSince || 'Just now'}

*Escalation Level:*
Level ${level}

Please respond immediately.
${dashboardUrl ? `\n*Open Review:*\n${dashboardUrl}` : ''}`;

    try {
      const result = await this.provider.sendText({ to: toNumber, body });
      this.logger.log('[WhatsApp] Escalation alert sent', { to: toNumber, businessName, rating, level });
      return result;
    } catch (err: any) {
      this.logger.error('[WhatsApp] Failed to send escalation alert', { error: err.message, to: toNumber, level });
      throw err;
    }
  }

  /**
   * Send a generic text message.
   */
  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.provider.sendText({ to, body });
  }
}
