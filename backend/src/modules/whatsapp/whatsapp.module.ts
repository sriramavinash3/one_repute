import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppTemplateService } from './whatsapp-template.service';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { Dialog360Provider } from './providers/dialog360.provider';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

@Module({
  imports: [ConfigModule],
  controllers: [WhatsAppWebhookController],
  providers: [
    TwilioWhatsAppProvider,
    Dialog360Provider,
    WhatsAppTemplateService,
    WhatsAppService,
    TwilioSignatureGuard,
  ],
  exports: [WhatsAppService, WhatsAppTemplateService, TwilioSignatureGuard],
})
export class WhatsAppModule {}
