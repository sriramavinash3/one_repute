import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationService } from './notification.service';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [ConfigModule, WhatsAppModule, FirebaseModule, EmailModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
