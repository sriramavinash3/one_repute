import { Module } from '@nestjs/common';
import { PurgeService } from './purge.service';
import { PurgeController } from './purge.controller';
import { FirebaseModule } from '../firebase/firebase.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [
    FirebaseModule,
    PrismaModule,
    CacheModule,
    StorageModule,
  ],
  controllers: [PurgeController],
  providers: [PurgeService],
  exports: [PurgeService],
})
export class PurgeModule {}
