import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AutomationService } from './automation.service';
import { AIModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { EscalationModule } from '../escalation/escalation.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [ConfigModule, AIModule, NotificationsModule, FirebaseModule, EscalationModule, WhatsAppModule],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class WorkflowModule {}
