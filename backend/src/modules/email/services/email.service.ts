/**
 * src/modules/email/services/email.service.ts
 * 
 * Main Email Service API for dispatching transactional email jobs.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EmailQueueService } from '../queues/email.queue';
import { EmailWorkerService } from '../workers/email.worker';
import { TokenService } from '../../auth/token.service';
import { loadEmailConfig } from '../../../config/email.config';
import { EmailJobType } from '../queues/email.job.types';
import {
  SendWelcomeEmailDto,
  SendVerificationEmailDto,
  SendPasswordResetDto,
  SendPasswordChangedDto,
  SendInvitationDto,
  SendSubscriptionActivatedDto,
  SendWeeklyReportDto,
  SendFifteenDayReportDto,
  SendOnboardingConfirmedDto,
  SendReviewAlertDto,
  SendEscalationEmailDto,
} from '../dto/email.dto';

export interface EmailDispatchResult {
  success: boolean;
  jobId: string;
  queuedAt: string;
  recipient: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly appUrl: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly emailQueue: EmailQueueService,
    private readonly emailWorker: EmailWorkerService,
    private readonly tokenService: TokenService,
  ) {
    const config = loadEmailConfig();
    this.appUrl = config.appUrl;
    this.frontendUrl = config.frontendUrl;
  }

  /**
   * Helper to dispatch job to queue, with immediate local processing fallback
   */
  private async dispatchJob(type: EmailJobType, data: any): Promise<EmailDispatchResult> {
    const jobId = await this.emailQueue.addJob({ type: type as any, data });
    
    // If job was dispatched in inline fallback mode (no active Redis worker), execute immediately
    if (jobId.startsWith('inline_')) {
      this.emailWorker.processJob({ id: jobId, name: type, data: { type: type as any, data } as any }).catch((err) => {
        this.logger.error(`Inline email execution failed for ${data.recipientEmail}: ${err.message}`);
      });
    }

    return {
      success: true,
      jobId,
      queuedAt: new Date().toISOString(),
      recipient: data.recipientEmail,
    };
  }

  async sendWelcomeEmail(dto: SendWelcomeEmailDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Welcome email for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.WELCOME, {
      ...dto,
      dashboardUrl: dto.dashboardUrl || `${this.frontendUrl}/dashboard`,
    });
  }

  async sendVerificationEmail(dto: SendVerificationEmailDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Verification email for ${dto.recipientEmail}`);
    const expiresInHours = dto.expiresInHours || 24;

    let verificationUrl = dto.verificationUrl;
    if (!verificationUrl) {
      const tokenInfo = this.tokenService.generateSecureToken(expiresInHours * 60);
      await this.tokenService.storeToken(dto.recipientEmail, tokenInfo);
      verificationUrl = `${this.frontendUrl}/verify-email?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.recipientEmail)}`;
    }

    return this.dispatchJob(EmailJobType.VERIFICATION, {
      ...dto,
      verificationUrl,
      expiresInHours,
    });
  }

  async sendPasswordReset(dto: SendPasswordResetDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Password Reset email for ${dto.recipientEmail}`);
    const expiresInMinutes = dto.expiresInMinutes || 15;

    let resetUrl = dto.resetUrl;
    if (!resetUrl) {
      const tokenInfo = this.tokenService.generateSecureToken(expiresInMinutes);
      await this.tokenService.storeToken(dto.recipientEmail, tokenInfo);
      resetUrl = `${this.frontendUrl}/reset-password?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.recipientEmail)}`;
    }

    return this.dispatchJob(EmailJobType.PASSWORD_RESET, {
      ...dto,
      resetUrl,
      expiresInMinutes,
    });
  }

  async sendPasswordChanged(dto: SendPasswordChangedDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Password Changed alert for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.PASSWORD_CHANGED, {
      ...dto,
      changeTimestamp: dto.changeTimestamp || new Date().toUTCString(),
      securityUrl: dto.securityUrl || `${this.frontendUrl}/settings/security`,
    });
  }

  async sendInvitation(dto: SendInvitationDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Team Invite email for ${dto.recipientEmail}`);
    const expiresInDays = dto.expiresInDays || 7;

    let inviteUrl = dto.inviteUrl;
    if (!inviteUrl) {
      const tokenInfo = this.tokenService.generateSecureToken(expiresInDays * 24 * 60);
      await this.tokenService.storeToken(dto.recipientEmail, tokenInfo);
      inviteUrl = `${this.frontendUrl}/invite/accept?token=${tokenInfo.rawToken}&email=${encodeURIComponent(dto.recipientEmail)}`;
    }

    return this.dispatchJob(EmailJobType.TEAM_INVITE, {
      ...dto,
      inviteUrl,
      expiresInDays,
    });
  }

  async sendSubscriptionActivated(dto: SendSubscriptionActivatedDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Subscription Confirmation email for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.SUBSCRIPTION_ACTIVATED, {
      ...dto,
      dashboardUrl: dto.dashboardUrl || `${this.frontendUrl}/dashboard`,
    });
  }

  async sendWeeklyReport(dto: SendWeeklyReportDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Weekly Reputation Report for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.WEEKLY_REPORT, {
      ...dto,
      analyticsUrl: dto.analyticsUrl || `${this.frontendUrl}/analytics`,
    });
  }

  async sendFifteenDayReport(dto: SendFifteenDayReportDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing 15-Day Reputation Intelligence Report for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.FIFTEEN_DAY_REPORT, {
      ...dto,
      analyticsUrl: dto.analyticsUrl || `${this.frontendUrl}/outlet/reports`,
    });
  }

  async sendOnboardingConfirmed(dto: SendOnboardingConfirmedDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Business Onboarding Confirmation email for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.ONBOARDING_CONFIRMED, {
      ...dto,
      dashboardUrl: dto.dashboardUrl || `${this.frontendUrl}/outlet/dashboard`,
    });
  }

  async sendReviewAlert(dto: SendReviewAlertDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing New Review Alert for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.REVIEW_ALERT, {
      ...dto,
      dashboardUrl: dto.dashboardUrl || `${this.frontendUrl}/dashboard/reviews`,
      aiReplyUrl: dto.aiReplyUrl || `${this.frontendUrl}/dashboard/reviews?action=ai-reply`,
    });
  }

  async sendEscalationEmail(dto: SendEscalationEmailDto): Promise<EmailDispatchResult> {
    this.logger.log(`Queueing Review Escalation Level ${dto.level} email for ${dto.recipientEmail}`);
    return this.dispatchJob(EmailJobType.ESCALATION_ALERT, {
      ...dto,
      dashboardUrl: dto.dashboardUrl || `${this.frontendUrl}/outlet-dashboard/reviews`,
    });
  }
}
