/**
 * src/modules/email/email.module.ts
 */

import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ResendModule } from './resend/resend.module';
import { EmailQueueService } from './queues/email.queue';
import { EmailWorkerService } from './workers/email.worker';
import { EmailMetricsService } from './metrics/email.metrics.service';
import { EmailAuditService } from './services/email.audit.service';
import { EmailService } from './services/email.service';
import { EmailController } from './controllers/email.controller';
import { TokenService } from '../auth/token.service';
import { loadEmailConfig } from '../../config/email.config';

@Module({
  imports: [ResendModule],
  controllers: [EmailController],
  providers: [
    EmailQueueService,
    EmailWorkerService,
    EmailMetricsService,
    EmailAuditService,
    EmailService,
    TokenService,
  ],
  exports: [EmailService, TokenService, EmailMetricsService, EmailAuditService],
})
export class EmailModule implements OnModuleInit {
  private readonly logger = new Logger(EmailModule.name);

  onModuleInit() {
    const config = loadEmailConfig();
    const isMock = !config.resendApiKey || config.resendApiKey.startsWith('re_mock');

    this.logger.log('====================================================');
    this.logger.log(`[EmailModule] Initialized (Env: ${config.nodeEnv})`);
    this.logger.log(`[EmailModule] Provider: Resend (Mode: ${isMock ? 'MOCK / SIMULATION' : 'PRODUCTION RESEND API'})`);
    this.logger.log(`[EmailModule] Sender: ${config.emailFrom}`);
    this.logger.log(`[EmailModule] Frontend Base URL: ${config.frontendUrl}`);
    this.logger.log(`[EmailModule] App URL: ${config.appUrl}`);
    if (isMock && config.nodeEnv === 'production') {
      this.logger.error('[EmailModule] WARNING: RESEND_API_KEY is not set in PRODUCTION mode! Emails will be simulated.');
    }
    this.logger.log('====================================================');
  }
}
