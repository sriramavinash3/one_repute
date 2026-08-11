import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { ReviewSyncService } from './review-sync.service';
import { ReviewReplyService } from './review-reply.service';
import { ReviewAnalyticsService } from './review-analytics.service';
import { ReputationService } from './reputation.service';
import { ReviewSchedulerService } from './review-scheduler.service';
import { GoogleBusinessModule } from '../google-business/google-business.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { AuthModule } from '../auth/auth.module';
import { AIModule } from '../ai/ai.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [
    ConfigModule,
    GoogleBusinessModule,
    PrismaModule,
    FirebaseModule,
    AuthModule,
    AIModule,
    WorkflowModule,
  ],
  controllers: [ReviewsController],
  providers: [
    ReviewsService,
    ReviewSyncService,
    ReviewReplyService,
    ReviewAnalyticsService,
    ReputationService,
    ReviewSchedulerService,
  ],
  exports: [ReviewsService, ReviewSyncService, ReviewSchedulerService],
})
export class ReviewsModule {}
