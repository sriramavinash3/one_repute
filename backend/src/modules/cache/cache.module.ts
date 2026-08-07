import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheService } from './cache.service';
import { MemoryCacheProvider } from './providers/memory-cache.provider';
import { RedisCacheProvider } from './providers/redis-cache.provider';

@Module({
  imports: [ConfigModule],
  providers: [MemoryCacheProvider, RedisCacheProvider, CacheService],
  exports: [CacheService],
})
export class CacheModule {}
