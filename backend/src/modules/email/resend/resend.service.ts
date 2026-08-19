/**
 * src/modules/email/resend/resend.service.ts
 * 
 * Production-grade integration wrapper for Resend API & React Email Rendering.
 * Features: Timeout protection, fallback sender identity, safe credential sanitization,
 * and transient retry support.
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
  private readonly fallbackEmailFrom: string;
  private readonly timeoutMs: number;
  private readonly isMock: boolean;

  constructor() {
    const config = loadEmailConfig();
    this.fromEmail = config.emailFrom;
    this.fallbackEmailFrom = config.fallbackEmailFrom;
    this.timeoutMs = config.timeoutMs;

    if (config.resendApiKey && !config.resendApiKey.startsWith('re_mock')) {
      this.resendClient = new Resend(config.resendApiKey);
      this.isMock = false;
    } else {
      this.logger.warn('Resend API key not configured or set to mock mode. Operating in simulation mode.');
      this.isMock = true;
    }
  }

  /**
   * Sanitize error message to prevent accidental credential or token leaks in log files
   */
  private sanitizeErrorMessage(message: string): string {
    if (!message) return 'Unknown error';
    return String(message)
      .replace(/re_[a-zA-Z0-9_-]{20,}/g, 're_****************')
      .replace(/bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ****************')
      .replace(/token=[a-zA-Z0-9_-]+/gi, 'token=****************');
  }

  /**
   * Render React element to HTML and send via Resend API with timeout & retry handling
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const startTime = Date.now();

    try {
      // 1. Render template to HTML and plain text
      const htmlContent = await render(payload.templateComponent);
      const textContent = await render(payload.templateComponent, { plainText: true });

      const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];

      // 2. Mock mode handling for dev / test environments without active API keys
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

      // 3. Dispatch to Resend API with timeout handling
      let fromAddress = this.fromEmail;

      const sendPromise = this.resendClient.emails.send({
        from: fromAddress,
        to: recipients,
        subject: payload.subject,
        html: htmlContent,
        text: textContent,
        replyTo: payload.replyTo,
        tags: payload.tags,
      });

      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Resend API call timed out after ${this.timeoutMs}ms`));
        }, this.timeoutMs);
      });

      let response: any;
      try {
        response = await Promise.race([sendPromise, timeoutPromise]);
      } catch (timeoutErr: any) {
        return {
          id: '',
          status: 'failed',
          latencyMs: Date.now() - startTime,
          error: this.sanitizeErrorMessage(timeoutErr.message),
        };
      }

      // 4. If Resend returns unverified domain error, retry with fallback sender
      if (response.error && (response.error.message.includes('domain') || response.error.message.includes('verify') || response.error.message.includes('testing'))) {
        this.logger.warn(`Primary domain dispatch failed (${this.sanitizeErrorMessage(response.error.message)}). Retrying with fallback sender '${this.fallbackEmailFrom}'`);
        
        try {
          const fallbackResponse = await this.resendClient.emails.send({
            from: this.fallbackEmailFrom,
            to: recipients,
            subject: payload.subject,
            html: htmlContent,
            text: textContent,
            replyTo: payload.replyTo,
            tags: payload.tags,
          });

          if (!fallbackResponse.error) {
            const emailId = fallbackResponse.data?.id || `resend_${Date.now()}`;
            const latencyMs = Date.now() - startTime;
            this.logger.log(`Successfully dispatched email via fallback sender to ${recipients.join(', ')} | ID: ${emailId} (${latencyMs}ms)`);
            return {
              id: emailId,
              status: 'sent',
              latencyMs,
            };
          }
        } catch (fbErr: any) {
          // Fallback retry error caught below
        }
      }

      const latencyMs = Date.now() - startTime;

      if (response.error) {
        const sanitizedErr = this.sanitizeErrorMessage(response.error.message);
        this.logger.error(`Resend API Error sending to ${recipients.join(', ')}: ${sanitizedErr}`);
        return {
          id: '',
          status: 'failed',
          latencyMs,
          error: sanitizedErr,
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
      const errorMessage = this.sanitizeErrorMessage(err?.message || 'Unknown error occurred rendering or sending email');
      this.logger.error(`Failed to send email to ${payload.to}: ${errorMessage}`);

      return {
        id: '',
        status: 'failed',
        latencyMs,
        error: errorMessage,
      };
    }
  }
}
