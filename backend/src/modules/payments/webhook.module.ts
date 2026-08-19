import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PaymentsConfigService } from './payments-config.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ConfigModule, WhatsAppModule, EmailModule],
  controllers: [WebhookController],
  providers: [
    WebhookService,
    PaymentsConfigService,
  ],
  exports: [
    WebhookService,
  ],
})
export class WebhookModule {}
