/**
 * src/modules/email/resend/resend.service.ts
 * 
 * Integration wrapper for Resend API & React Email Rendering.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { render } from '@react-email/render';
import * as React from 'react';
import { loadEmailConfig } from '../../../config/email.config';

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  templateComponent: React.ReactElement;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
}

export interface SendEmailResult {
  id: string;
  status: 'sent' | 'failed' | 'mocked';
  latencyMs: number;
  error?: string;
}

@Injectable()
export class ResendService {
  private readonly logger = new Logger(ResendService.name);
  private readonly resendClient: Resend | null = null;
  private readonly fromEmail: string;
  private readonly isMock: boolean;

  constructor() {
    const config = loadEmailConfig();
    this.fromEmail = config.emailFrom;

    if (config.resendApiKey && !config.resendApiKey.startsWith('re_mock')) {
      this.resendClient = new Resend(config.resendApiKey);
      this.isMock = false;
    } else {
      this.logger.warn('Resend API key not configured or set to mock mode. Operating in simulation mode.');
      this.isMock = true;
    }
  }

  /**
   * Render React element to HTML and send via Resend
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const startTime = Date.now();

    try {
      // 1. Render template to HTML and plain text
      const htmlContent = await render(payload.templateComponent);
      const textContent = await render(payload.templateComponent, { plainText: true });

      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

      // 2. Mock mode handling
      if (this.isMock || !this.resendClient) {
        const latencyMs = Date.now() - startTime;
        const mockId = `mock_msg_${Math.random().toString(36).substring(2, 11)}`;
        this.logger.log(`[MOCK EMAIL SENT] To: ${recipients.join(', ')} | Subject: "${payload.subject}" | ID: ${mockId} (${latencyMs}ms)`);
        return {
          id: mockId,
          status: 'mocked',
          latencyMs,
        };
      }

      // 3. Dispatch to Resend API
      const response = await this.resendClient.emails.send({
        from: this.fromEmail,
        to: recipients,
        subject: payload.subject,
        html: htmlContent,
        text: textContent,
        replyTo: payload.replyTo,
        tags: payload.tags,
      });

      const latencyMs = Date.now() - startTime;

      if (response.error) {
        this.logger.error(`Resend API Error sending to ${recipients.join(', ')}: ${response.error.message}`);
        return {
          id: '',
          status: 'failed',
          latencyMs,
          error: response.error.message,
        };
      }

      const emailId = response.data?.id || `resend_${Date.now()}`;
      this.logger.log(`Successfully dispatched email to ${recipients.join(', ')} | ID: ${emailId} (${latencyMs}ms)`);

      return {
        id: emailId,
        status: 'sent',
        latencyMs,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = err?.message || 'Unknown error occurred rendering or sending email';
      this.logger.error(`Failed to send email to ${payload.to}: ${errorMessage}`, err?.stack);

      return {
        id: '',
        status: 'failed',
        latencyMs,
        error: errorMessage,
      };
    }
  }
}
