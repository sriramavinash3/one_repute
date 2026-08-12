import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { Dialog360Provider } from './providers/dialog360.provider';
import { IWhatsAppProvider, WhatsAppSendResult } from './interfaces/whatsapp-provider.interface';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { FirebaseService } from '../firebase/firebase.service';
import { normalizePhoneNumber } from '../../common/utils/phone-number.util';

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

export interface SendTemplateMessageParams {
  templateKey: string;
  toNumber: string;
  variables: Record<string, any>;
  idempotencyKey?: string;
  outletId?: string;
  customerId?: string;
  planName?: string;
  isPaid?: boolean;
  isTrial?: boolean;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: IWhatsAppProvider;

  constructor(
    private readonly config: ConfigService,
    private readonly twilioProvider: TwilioWhatsAppProvider,
    private readonly dialog360Provider: Dialog360Provider,
    private readonly templateService: WhatsAppTemplateService,
    private readonly firebaseService: FirebaseService,
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
   * Centralized method to send a WhatsApp notification using a named template.
   * Handles plan eligibility, required variable validation, phone E.164 normalization,
   * idempotency checking, Twilio delivery, and database notification logging.
   */
  async sendTemplateByName(params: SendTemplateMessageParams): Promise<WhatsAppSendResult | null> {
    const { templateKey, toNumber, variables, idempotencyKey, outletId, customerId, planName, isPaid, isTrial } = params;

    // 1. Provider availability check
    if (!this.isAvailable()) {
      this.logger.warn(`[WhatsApp] Provider not available — skipping template '${templateKey}' for ${toNumber}`);
      return null;
    }

    // 2. Plan eligibility check
    if (planName !== undefined && !this.templateService.isEligibleForPlan(templateKey, planName, Boolean(isPaid), Boolean(isTrial))) {
      this.logger.warn(`[WhatsApp] Template '${templateKey}' not eligible for plan '${planName}' (customer: ${customerId}). Skipped.`);
      return null;
    }

    // 3. Idempotency Check
    const db = this.firebaseService.getDb();
    if (idempotencyKey) {
      try {
        const existingSnap = await db.collection('notificationLogs')
          .where('idempotencyKey', '==', idempotencyKey)
          .where('success', '==', true)
          .limit(1)
          .get();

        if (!existingSnap.empty) {
          const docData = existingSnap.docs[0].data();
          this.logger.warn(`[WhatsApp] Idempotent send skipped — key '${idempotencyKey}' already sent.`);
          return { messageId: docData.messageId || 'duplicate-skipped', provider: this.provider.providerName, status: 'already_sent' };
        }
      } catch (err: any) {
        this.logger.warn(`[WhatsApp] Idempotency check failed for key ${idempotencyKey}: ${err.message}`);
      }
    }

    // 4. Render & Validate variables
    let rendered;
    try {
      rendered = this.templateService.renderTemplate(templateKey, variables);
    } catch (err: any) {
      this.logger.error(`[WhatsApp] Template rendering aborted for '${templateKey}': ${err.message}`);
      await this.logNotificationRecord({
        templateKey,
        outletId,
        customerId,
        recipientPhone: toNumber,
        success: false,
        error: err.message,
        idempotencyKey,
      });
      return null; // Do not send broken message if variables missing!
    }

    // 5. Phone Normalization
    const formattedPhone = normalizePhoneNumber(toNumber);

    // 6. Execute Send
    const scheduledTime = new Date();
    try {
      let result: WhatsAppSendResult;
      if (rendered.contentSid && typeof (this.provider as any).sendTemplate === 'function') {
        result = await this.provider.sendTemplate({
          to: formattedPhone,
          templateName: templateKey,
          languageCode: 'en',
          parameters: rendered.contentVariables,
        });
      } else {
        result = await this.provider.sendText({ to: formattedPhone, body: rendered.body });
      }

      const sentTime = new Date();
      this.logger.log(`[WhatsApp] Template '${templateKey}' sent to ${formattedPhone} (MessageSid: ${result.messageId})`);

      await this.logNotificationRecord({
        templateKey,
        outletId,
        customerId,
        recipientPhone: formattedPhone,
        success: true,
        messageId: result.messageId,
        status: result.status || 'sent',
        provider: result.provider,
        idempotencyKey,
        scheduledTime,
        sentTime,
      });

      return result;
    } catch (err: any) {
      this.logger.error(`[WhatsApp] Failed to send template '${templateKey}' to ${formattedPhone}: ${err.message}`);
      await this.logNotificationRecord({
        templateKey,
        outletId,
        customerId,
        recipientPhone: formattedPhone,
        success: false,
        error: err.message,
        idempotencyKey,
        scheduledTime,
      });
      throw err;
    }
  }

  private async logNotificationRecord(data: {
    templateKey: string;
    outletId?: string;
    customerId?: string;
    recipientPhone: string;
    success: boolean;
    messageId?: string;
    status?: string;
    provider?: string;
    error?: string;
    idempotencyKey?: string;
    scheduledTime?: Date;
    sentTime?: Date;
  }): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      await db.collection('notificationLogs').add({
        templateKey: data.templateKey,
        event: data.templateKey.toLowerCase(),
        channel: 'whatsapp',
        outletId: data.outletId || null,
        customerId: data.customerId || null,
        recipient: { phone: data.recipientPhone },
        success: data.success,
        messageId: data.messageId || null,
        deliveryStatus: data.status || (data.success ? 'sent' : 'failed'),
        provider: data.provider || this.provider.providerName,
        failureReason: data.error || null,
        idempotencyKey: data.idempotencyKey || null,
        scheduledTime: data.scheduledTime || new Date(),
        sentTime: data.sentTime || (data.success ? new Date() : null),
        retryCount: 0,
        timestamp: new Date(),
      });
    } catch (err: any) {
      this.logger.error(`[WhatsApp] Failed to record notification log: ${err.message}`);
    }
  }

  /**
   * Send a negative review alert to the outlet manager.
   */
  async sendNegativeReviewAlert(params: NegativeReviewAlertParams): Promise<WhatsAppSendResult | null> {
    const { toNumber, outletName, rating, reviewText, customerName, aiSuggestedResponse } = params;
    return this.sendTemplateByName({
      templateKey: 'ESCALATION_LEVEL_1',
      toNumber,
      variables: {
        Name: 'Manager',
        'Outlet Name': outletName,
        Rating: String(rating),
        'Customer Name': customerName,
        'Review Snip': (reviewText || '(No comment provided)').slice(0, 100),
        Link: 'https://app.onerepute.com/reviews',
      },
    });
  }

  /**
   * Send an escalation alert to the responsible contact.
   */
  async sendEscalationAlert(params: EscalationAlertParams): Promise<WhatsAppSendResult | null> {
    const { toNumber, businessName, customerName, rating, reviewText, level, dashboardUrl } = params;
    const templateKey = level === 1 ? 'ESCALATION_LEVEL_1' : level === 2 ? 'ESCALATION_LEVEL_2' : 'ESCALATION_LEVEL_3';

    return this.sendTemplateByName({
      templateKey,
      toNumber,
      variables: {
        Name: `Level ${level} Contact`,
        'Outlet Name': businessName,
        Rating: String(rating),
        'Customer Name': customerName,
        'Review Snip': (reviewText || '(No comment provided)').slice(0, 100),
        Link: dashboardUrl || 'https://app.onerepute.com/reviews',
      },
    });
  }

  /**
   * Send a generic text message.
   */
  async sendText(to: string, body: string): Promise<WhatsAppSendResult> {
    return this.provider.sendText({ to: normalizePhoneNumber(to), body });
  }
}
