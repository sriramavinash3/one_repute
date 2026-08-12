/**
 * src/modules/email/workers/email.worker.ts
 * 
 * BullMQ Email Worker Processor & Job Handlers.
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import * as React from 'react';
import { loadEmailConfig } from '../../../config/email.config';
import { ResendService, SendEmailResult } from '../resend/resend.service';
import { EmailMetricsService } from '../metrics/email.metrics.service';
import { EmailJobPayload, EmailJobType } from '../queues/email.job.types';

// React Email Component imports
import WelcomeEmail from '../../../emails/Welcome';
import VerifyEmail from '../../../emails/VerifyEmail';
import ResetPassword from '../../../emails/ResetPassword';
import PasswordChanged from '../../../emails/PasswordChanged';
import TeamInvite from '../../../emails/TeamInvite';
import SubscriptionActivated from '../../../emails/SubscriptionActivated';
import WeeklyReport from '../../../emails/WeeklyReport';
import FifteenDayReport from '../../../emails/FifteenDayReport';
import OnboardingConfirmed from '../../../emails/OnboardingConfirmed';
import ReviewAlert from '../../../emails/ReviewAlert';
import EscalationAlert from '../../../emails/EscalationAlert';

@Injectable()
export class EmailWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailWorkerService.name);
  private worker: Worker | null = null;
  private redisClient: Redis | null = null;

  constructor(
    private readonly resendService: ResendService,
    private readonly metricsService: EmailMetricsService,
  ) {}

  async onModuleInit() {
    const config = loadEmailConfig();
    try {
      this.redisClient = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Don't block startup if Redis isn't running locally
      });

      this.redisClient.on('error', () => {
        // Silently catch connection error; worker will remain inactive unless Redis is reachable
      });

      this.worker = new Worker(
        config.queue.name,
        async (job: Job<EmailJobPayload>) => {
          return this.processJob(job);
        },
        {
          connection: this.redisClient,
          concurrency: config.queue.concurrency,
        },
      );

      this.worker.on('completed', (job: Job) => {
        this.logger.log(`Job [${job.name}] (ID: ${job.id}) completed successfully.`);
      });

      this.worker.on('failed', (job: Job | undefined, err: Error) => {
        const jobId = job ? job.id : 'unknown';
        const jobName = job ? job.name : 'unknown';
        this.logger.error(`Job [${jobName}] (ID: ${jobId}) failed on attempt ${job?.attemptsMade}: ${err.message}`);
        
        if (job && job.attemptsMade >= (config.queue.maxRetries || 3)) {
          this.logger.error(`[DEAD LETTER QUEUE] Job [${jobName}] (ID: ${jobId}) reached max retries. Moved to DLQ failure store.`);
        }
      });

      this.logger.log(`Email Worker initialized for queue '${config.queue.name}'`);
    } catch (err: any) {
      this.logger.warn(`Email Worker skipped active Redis worker registration: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }

  /**
   * Process single email job payload (usable directly or via BullMQ worker)
   */
  async processJob(job: Job<EmailJobPayload> | { id: string; name: string; data: EmailJobPayload }): Promise<SendEmailResult> {
    const payload = job.data;
    const startTime = Date.now();
    this.logger.log(`Processing email job [${payload.type}] for recipient ${payload.data.recipientEmail}`);

    let templateComponent: React.ReactElement;
    let subject: string;

    switch (payload.type) {
      case EmailJobType.WELCOME:
        subject = 'Welcome to OneRepute 🚀';
        templateComponent = React.createElement(WelcomeEmail, payload.data);
        break;

      case EmailJobType.VERIFICATION:
        subject = 'Verify your OneRepute email address';
        templateComponent = React.createElement(VerifyEmail, payload.data);
        break;

      case EmailJobType.PASSWORD_RESET:
        subject = 'Reset your OneRepute password';
        templateComponent = React.createElement(ResetPassword, payload.data);
        break;

      case EmailJobType.PASSWORD_CHANGED:
        subject = 'Security Alert: Your OneRepute password was changed';
        templateComponent = React.createElement(PasswordChanged, payload.data);
        break;

      case EmailJobType.TEAM_INVITE:
        subject = `You have been invited to join ${payload.data.workspaceName} on OneRepute`;
        templateComponent = React.createElement(TeamInvite, payload.data);
        break;

      case EmailJobType.SUBSCRIPTION_ACTIVATED:
        subject = `Subscription Confirmed: Welcome to OneRepute ${payload.data.planName}`;
        templateComponent = React.createElement(SubscriptionActivated, payload.data);
        break;

      case EmailJobType.WEEKLY_REPORT:
        subject = `Weekly Reputation Report for ${payload.data.businessName}`;
        templateComponent = React.createElement(WeeklyReport, payload.data);
        break;

      case EmailJobType.FIFTEEN_DAY_REPORT:
        subject = `15-Day Reputation Performance Report for ${payload.data.businessName}`;
        templateComponent = React.createElement(FifteenDayReport, payload.data);
        break;

      case EmailJobType.ONBOARDING_CONFIRMED:
        subject = `Business Setup Complete: Welcome ${payload.data.businessName} to OneRepute`;
        templateComponent = React.createElement(OnboardingConfirmed, payload.data);
        break;

      case EmailJobType.REVIEW_ALERT:
        subject = `New ${payload.data.rating}-Star Review Alert for ${payload.data.businessName}`;
        templateComponent = React.createElement(ReviewAlert, payload.data);
        break;

      case EmailJobType.ESCALATION_ALERT:
        subject = `Review Escalation - Level ${payload.data.level}`;
        templateComponent = React.createElement(EscalationAlert, payload.data);
        break;

      default:
        throw new Error(`Unsupported email job type: ${(payload as any).type}`);
    }

    const result = await this.resendService.sendEmail({
      to: payload.data.recipientEmail,
      subject,
      templateComponent,
      tags: [
        { name: 'template', value: payload.type },
        { name: 'queueId', value: String(job.id) },
      ],
    });

    const totalLatencyMs = Date.now() - startTime;

    // Log metrics & audit event
    await this.metricsService.recordEmailEvent({
      userId: payload.data.userId,
      email: payload.data.recipientEmail,
      template: payload.type,
      provider: 'resend',
      status: result.status === 'sent' || result.status === 'mocked' ? 'DELIVERED' : 'FAILED',
      queueId: String(job.id),
      latencyMs: totalLatencyMs,
      failureReason: result.error,
      retries: (job as any).attemptsMade || 0,
      metadata: { subject, resultId: result.id },
    });

    if (result.status === 'failed') {
      throw new Error(`Email delivery failed: ${result.error}`);
    }

    return result;
  }
}
