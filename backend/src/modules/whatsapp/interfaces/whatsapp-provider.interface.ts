/**
 * src/modules/whatsapp/interfaces/whatsapp-provider.interface.ts
 */

export interface WhatsAppTextPayload {
  to: string;
  body: string;
}

export interface WhatsAppTemplatePayload {
  to: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
  parameters?: Record<string, string>;
}

export interface WhatsAppSendResult {
  messageId: string;
  provider: string;
  status: string;
}

export interface IWhatsAppProvider {
  readonly providerName: string;
  sendText(payload: WhatsAppTextPayload): Promise<WhatsAppSendResult>;
  sendTemplate(payload: WhatsAppTemplatePayload): Promise<WhatsAppSendResult>;
  isAvailable(): boolean;
}
