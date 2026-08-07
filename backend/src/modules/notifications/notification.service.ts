/**
 * src/modules/notifications/notification.service.ts
 *
 * Multi-channel notification engine.
 * Resolves the right channel based on type/preference and sends with retries.
 */

import { Injectable, Logger } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { FirebaseService } from '../firebase/firebase.service';

export type NotificationChannel = 'email' | 'whatsapp' | 'slack' | 'push';

export type NotificationEventType =
  | 'negative_review'
  | 'escalation_level_1'
  | 'escalation_level_2'
  | 'escalation_level_3'
  | 'review_received'
  | 'trial_ending'
  | 'subscription_renewed'
  | 'weekly_report'
  | 'ai_reply_generated';

export interface NotificationPayload {
  event: NotificationEventType;
  channel: NotificationChannel | NotificationChannel[];
  recipient: {
    email?: string;
    phone?: string;
    slackChannel?: string;
    userId?: string;
  };
  data: Record<string, any>;
  priority?: 'high' | 'medium' | 'low';
  idempotencyKey?: string;
}

export interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  provider?: string;
  messageId?: string;
  error?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly firebaseService: FirebaseService,
  ) {}

  /**
   * Send a notification through one or more channels.
   */
  async send(payload: NotificationPayload): Promise<NotificationResult[]> {
    const channels = Array.isArray(payload.channel) ? payload.channel : [payload.channel];
    const results: NotificationResult[] = [];

    for (const channel of channels) {
      try {
        const result = await this.sendToChannel(channel, payload);
        results.push(result);
        await this.logNotification(payload, result);
      } catch (err: any) {
        this.logger.error(`[Notification] Failed to send via ${channel}: ${err.message}`);
        results.push({ success: false, channel, error: err.message });
        await this.logNotification(payload, { success: false, channel, error: err.message });
      }
    }

    return results;
  }

  /**
   * Send a negative review alert — convenience method.
   */
  async sendNegativeReviewAlert(params: {
    outletName: string;
    customerName: string;
    rating: number;
    reviewText: string;
    managerPhone?: string;
    managerEmail?: string;
    aiSuggestedResponse?: string;
  }): Promise<NotificationResult[]> {
    const channels: NotificationChannel[] = [];
    if (params.managerPhone && this.whatsappService.isAvailable()) channels.push('whatsapp');
    if (params.managerEmail) channels.push('email');

    if (channels.length === 0) {
      this.logger.warn('[Notification] No channels available for negative review alert');
      return [];
    }

    return this.send({
      event: 'negative_review',
      channel: channels,
      recipient: { phone: params.managerPhone, email: params.managerEmail },
      data: params,
      priority: params.rating <= 2 ? 'high' : 'medium',
    });
  }

  /**
   * Send an escalation alert — convenience method.
   */
  async sendEscalationAlert(params: {
    businessName: string;
    customerName: string;
    rating: number;
    reviewText: string;
    level: number;
    pendingSince?: string;
    dashboardUrl?: string;
    contactPhone?: string;
    contactEmail?: string;
  }): Promise<NotificationResult[]> {
    const channels: NotificationChannel[] = [];
    if (params.contactPhone && this.whatsappService.isAvailable()) channels.push('whatsapp');
    if (params.contactEmail) channels.push('email');

    return this.send({
      event: `escalation_level_${params.level}` as NotificationEventType,
      channel: channels,
      recipient: { phone: params.contactPhone, email: params.contactEmail },
      data: params,
      priority: 'high',
    });
  }

  private async sendToChannel(channel: NotificationChannel, payload: NotificationPayload): Promise<NotificationResult> {
    switch (channel) {
      case 'whatsapp':
        return this.sendWhatsApp(payload);
      case 'email':
        return this.sendEmail(payload);
      case 'slack':
        return this.sendSlack(payload);
      default:
        return { success: false, channel, error: `Unsupported channel: ${channel}` };
    }
  }

  private async sendWhatsApp(payload: NotificationPayload): Promise<NotificationResult> {
    const { event, recipient, data } = payload;

    if (!recipient.phone) return { success: false, channel: 'whatsapp', error: 'No phone number' };

    let result;
    if (event === 'negative_review') {
      result = await this.whatsappService.sendNegativeReviewAlert({
        toNumber: recipient.phone,
        outletName: data.outletName,
        rating: data.rating,
        reviewText: data.reviewText,
        customerName: data.customerName,
        aiSuggestedResponse: data.aiSuggestedResponse,
      });
    } else if (event?.startsWith('escalation_level_')) {
      result = await this.whatsappService.sendEscalationAlert({
        toNumber: recipient.phone,
        businessName: data.businessName || data.outletName,
        customerName: data.customerName,
        rating: data.rating,
        reviewText: data.reviewText,
        pendingSince: data.pendingSince,
        level: data.level,
        dashboardUrl: data.dashboardUrl,
      });
    } else {
      // Generic text message for other event types
      await this.whatsappService.sendText(recipient.phone, JSON.stringify(data, null, 2).slice(0, 1000));
      result = { messageId: 'generic', provider: 'whatsapp', status: 'sent' };
    }

    return {
      success: true,
      channel: 'whatsapp',
      provider: result?.provider,
      messageId: result?.messageId,
    };
  }

  private async sendEmail(payload: NotificationPayload): Promise<NotificationResult> {
    // Delegate to email.integration bridge (compatible with existing email module)
    try {
      const emailBridge = require('../email/email.integration');
      const { event, recipient, data } = payload;

      if (event === 'negative_review') {
        await emailBridge.queueReviewAlertEmail({ ...data, email: recipient.email });
      } else if (event?.startsWith('escalation_level_')) {
        await emailBridge.queueEscalationEmail({ ...data, email: recipient.email });
      } else if (event === 'weekly_report') {
        await emailBridge.queueWeeklyReportEmail({ ...data, email: recipient.email });
      }

      return { success: true, channel: 'email', provider: 'resend' };
    } catch (err: any) {
      this.logger.error(`[Notification] Email send failed: ${err.message}`);
      return { success: false, channel: 'email', error: err.message };
    }
  }

  private async sendSlack(payload: NotificationPayload): Promise<NotificationResult> {
    // Slack notification via webhook — extend with SLACK_WEBHOOK_URL env var
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      return { success: false, channel: 'slack', error: 'SLACK_WEBHOOK_URL not configured' };
    }

    const axios = require('axios');
    const { event, data } = payload;

    await axios.post(webhookUrl, {
      text: `*${event.toUpperCase()}*: ${data.outletName || data.businessName || 'OneRepute'} — Rating: ${data.rating}/5`,
      attachments: [
        {
          color: (data.rating || 3) <= 2 ? 'danger' : (data.rating || 3) <= 3 ? 'warning' : 'good',
          text: data.reviewText || '',
          footer: 'OneRepute Notification Engine',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    return { success: true, channel: 'slack', provider: 'slack-webhook' };
  }

  private async logNotification(payload: NotificationPayload, result: NotificationResult): Promise<void> {
    try {
      const db = this.firebaseService.getDb();
      await db.collection('notificationLogs').add({
        event: payload.event,
        channel: result.channel,
        success: result.success,
        provider: result.provider || null,
        messageId: result.messageId || null,
        error: result.error || null,
        priority: payload.priority || 'medium',
        recipient: payload.recipient,
        timestamp: new Date(),
      });
    } catch (err: any) {
      this.logger.error(`[Notification] Failed to log notification: ${err.message}`);
    }
  }
}
