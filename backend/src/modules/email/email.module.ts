/**
 * src/modules/email/email.module.ts
 */

import { Module } from '@nestjs/common';
import { ResendModule } from './resend/resend.module';
import { EmailQueueService } from './queues/email.queue';
import { EmailWorkerService } from './workers/email.worker';
import { EmailMetricsService } from './metrics/email.metrics.service';
import { EmailService } from './services/email.service';
import { EmailController } from './controllers/email.controller';
import { TokenService } from '../auth/token.service';

@Module({
  imports: [ResendModule],
  controllers: [EmailController],
  providers: [
    EmailQueueService,
    EmailWorkerService,
    EmailMetricsService,
    EmailService,
    TokenService,
  ],
  exports: [EmailService, TokenService, EmailMetricsService],
})
export class EmailModule {}
