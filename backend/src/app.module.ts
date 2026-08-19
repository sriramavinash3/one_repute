/**
 * src/app.module.ts
 *
 * Root NestJS module for OneRepute backend.
 * Phase 5: Production Infrastructure, Observability, Storage, Cache, and Health modules registered.
 */

import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from './modules/email/email.module';
import { AuthModule } from './modules/auth/auth.module';
import { FirebaseModule } from './modules/firebase/firebase.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { WebhookModule } from './modules/payments/webhook.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { GoogleBusinessModule } from './modules/google-business/google-business.module';
import { AIModule } from './modules/ai/ai.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
// Phase 5 Infrastructure
import { StorageModule } from './modules/storage/storage.module';
import { CacheModule } from './modules/cache/cache.module';
import { HealthModule } from './modules/health/health.module';

import firebaseConfig from './config/firebase.config';
import appConfig from './config/app.config';
import { configValidationSchema } from './config/config.validation';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';

import { EscalationModule } from './modules/escalation/escalation.module';
import { AdminModule } from './modules/admin/admin.module';
import { AccountModule } from './modules/account/account.module';
import { PurgeModule } from './modules/purge/purge.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [firebaseConfig, appConfig],
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    // Infrastructure
    FirebaseModule,
    PrismaModule,
    StorageModule,
    CacheModule,
    HealthModule,
    // Features (Phases 1-4)
    EmailModule,
    AuthModule,
    AccountModule,
    PaymentsModule,
    WebhookModule,
    GoogleBusinessModule,
    ReviewsModule,
    AIModule,
    WhatsAppModule,
    NotificationsModule,
    WorkflowModule,
    SchedulerModule,
    EscalationModule,
    AdminModule,
    PurgeModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(CorrelationIdMiddleware).forRoutes('*');
  }
}
