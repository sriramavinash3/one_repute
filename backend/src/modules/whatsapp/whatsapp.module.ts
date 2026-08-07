import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { Dialog360Provider } from './providers/dialog360.provider';

@Module({
  imports: [ConfigModule],
  providers: [TwilioWhatsAppProvider, Dialog360Provider, WhatsAppService],
  exports: [WhatsAppService],
})
export class WhatsAppModule {}
