import { Module } from '@nestjs/common';
import { AdminController, DiscountsAndTicketsController } from './admin.controller';
import { AdminService } from './admin.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { GoogleBusinessModule } from '../google-business/google-business.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [FirebaseModule, PrismaModule, GoogleBusinessModule, SchedulerModule, EmailModule],
  controllers: [AdminController, DiscountsAndTicketsController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
