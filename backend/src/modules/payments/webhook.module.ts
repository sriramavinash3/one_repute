import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { PaymentsConfigService } from './payments-config.service';

@Module({
  imports: [ConfigModule],
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
