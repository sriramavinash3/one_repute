import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { IWhatsAppProvider, WhatsAppTextPayload, WhatsAppTemplatePayload, WhatsAppSendResult } from '../interfaces/whatsapp-provider.interface';

@Injectable()
export class Dialog360Provider implements IWhatsAppProvider {
  readonly providerName = '360dialog';
  private readonly logger = new Logger(Dialog360Provider.name);
  private readonly apiKey: string;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('DIALOG360_API_KEY') || '';
    this.fromNumber = this.config.get<string>('DIALOG360_FROM_NUMBER') || '';
  }

  isAvailable(): boolean {
    return !!(this.apiKey);
  }

  async sendText(payload: WhatsAppTextPayload): Promise<WhatsAppSendResult> {
    if (!this.isAvailable()) throw new Error('360dialog credentials not configured');

    const normalizedTo = payload.to.replace('+', '');
    const response = await axios.post(
      'https://waba.360dialog.io/v1/messages',
      { messaging_product: 'whatsapp', to: normalizedTo, type: 'text', text: { body: payload.body } },
      { headers: { 'Content-Type': 'application/json', 'D360-API-KEY': this.apiKey }, timeout: 10000 },
    );

    this.logger.debug(`[360dialog] Message sent: status=${response.status}`);
    return { messageId: response.data?.messages?.[0]?.id || 'unknown', provider: this.providerName, status: 'sent' };
  }

  async sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult> {
    if (!this.isAvailable()) throw new Error('360dialog credentials not configured');

    const normalizedTo = payload.to.replace('+', '');
    const response = await axios.post(
      'https://waba.360dialog.io/v1/messages',
      {
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'template',
        template: {
          name: payload.templateName,
          language: { code: payload.languageCode || 'en' },
          components: payload.components || [],
        },
      },
      { headers: { 'Content-Type': 'application/json', 'D360-API-KEY': this.apiKey }, timeout: 10000 },
    );

    return { messageId: response.data?.messages?.[0]?.id || 'unknown', provider: this.providerName, status: 'sent' };
  }
}
