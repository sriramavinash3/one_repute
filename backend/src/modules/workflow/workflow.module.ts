import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AutomationService } from './automation.service';
import { AIModule } from '../ai/ai.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { EscalationModule } from '../escalation/escalation.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleBusinessModule } from '../google-business/google-business.module';

@Module({
  imports: [
    ConfigModule,
    AIModule,
    NotificationsModule,
    FirebaseModule,
    EscalationModule,
    WhatsAppModule,
    PrismaModule,
    GoogleBusinessModule,
  ],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class WorkflowModule {}
