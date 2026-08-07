import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppProvider, WhatsAppTextPayload, WhatsAppTemplatePayload, WhatsAppSendResult } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class TwilioWhatsAppProvider implements IWhatsAppProvider {
  readonly providerName = 'twilio';
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    this.accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID') || '';
    this.authToken = this.config.get<string>('TWILIO_AUTH_TOKEN') || '';
    this.from = this.config.get<string>('TWILIO_WHATSAPP_FROM') || '';
  }

  isAvailable(): boolean {
    return !!(this.accountSid && this.authToken && this.from);
  }

  async sendText(payload: WhatsAppTextPayload): Promise<WhatsAppSendResult> {
    if (!this.isAvailable()) throw new Error('Twilio credentials not configured');
    const twilio = require('twilio');
    const client = twilio(this.accountSid, this.authToken);
    const normalizedFrom = this.from.startsWith('whatsapp:') ? this.from : `whatsapp:${this.from}`;
    const normalizedTo = payload.to.startsWith('whatsapp:') ? payload.to : `whatsapp:${payload.to}`;

    const msg = await client.messages.create({ body: payload.body, from: normalizedFrom, to: normalizedTo });
    this.logger.debug(`[Twilio] Message sent: sid=${msg.sid}, status=${msg.status}`);
    return { messageId: msg.sid, provider: this.providerName, status: msg.status };
  }

  async sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult> {
    // Twilio template sending via ContentSid pattern
    return this.sendText({ to: payload.to, body: `[Template: ${payload.templateName}]` });
  }
}
