/**
 * src/modules/email/controllers/email.controller.ts
 * 
 * NestJS REST controller for email triggers, health, & metrics.
 */

import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailService } from '../services/email.service';
import { EmailQueueService } from '../queues/email.queue';
import { EmailMetricsService } from '../metrics/email.metrics.service';
import {
  SendWelcomeEmailDto,
  SendVerificationEmailDto,
  SendPasswordResetDto,
  SendPasswordChangedDto,
  SendInvitationDto,
  SendSubscriptionActivatedDto,
  SendWeeklyReportDto,
  SendReviewAlertDto,
} from '../dto/email.dto';

@Controller('email')
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly emailQueueService: EmailQueueService,
    private readonly metricsService: EmailMetricsService,
  ) {}

  @Get('metrics')
  async getMetrics() {
    const metrics = this.metricsService.getMetrics();
    const queueStatus = await this.emailQueueService.getMetrics();
    return {
      success: true,
      queue: queueStatus,
      emailMetrics: metrics,
    };
  }

  @Post('welcome')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendWelcome(@Body() dto: SendWelcomeEmailDto) {
    return this.emailService.sendWelcomeEmail(dto);
  }

  @Post('verify')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendVerification(@Body() dto: SendVerificationEmailDto) {
    return this.emailService.sendVerificationEmail(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendPasswordReset(@Body() dto: SendPasswordResetDto) {
    return this.emailService.sendPasswordReset(dto);
  }

  @Post('password-changed')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendPasswordChanged(@Body() dto: SendPasswordChangedDto) {
    return this.emailService.sendPasswordChanged(dto);
  }

  @Post('invite')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendInvite(@Body() dto: SendInvitationDto) {
    return this.emailService.sendInvitation(dto);
  }

  @Post('subscription-activated')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendSubscriptionActivated(@Body() dto: SendSubscriptionActivatedDto) {
    return this.emailService.sendSubscriptionActivated(dto);
  }

  @Post('weekly-report')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendWeeklyReport(@Body() dto: SendWeeklyReportDto) {
    return this.emailService.sendWeeklyReport(dto);
  }

  @Post('review-alert')
  @HttpCode(HttpStatus.ACCEPTED)
  async sendReviewAlert(@Body() dto: SendReviewAlertDto) {
    return this.emailService.sendReviewAlert(dto);
  }
}
