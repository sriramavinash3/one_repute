import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { AIModule } from '../ai/ai.module';
import { CacheModule } from '../cache/cache.module';

@Module({
  imports: [PrismaModule, FirebaseModule, AIModule, CacheModule],
  controllers: [HealthController],
})
export class HealthModule {}
