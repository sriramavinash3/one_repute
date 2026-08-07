import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { ReviewsModule } from '../reviews/reviews.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AIModule } from '../ai/ai.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [ConfigModule, FirebaseModule, ReviewsModule, WorkflowModule, AIModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
