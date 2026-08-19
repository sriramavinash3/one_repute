import { Injectable, Logger } from '@nestjs/common';
import { MemoryCacheProvider } from './providers/memory-cache.provider';
import { RedisCacheProvider } from './providers/redis-cache.provider';
import { ICacheProvider } from './interfaces/cache-provider.interface';

@Injectable()
export class CacheService implements ICacheProvider {
  readonly providerName: string;
  private readonly logger = new Logger(CacheService.name);

  constructor(
    private readonly memoryCache: MemoryCacheProvider,
    private readonly redisCache: RedisCacheProvider,
  ) {
    this.providerName = 'unified-cache';
  }

  private async getActiveProvider(): Promise<ICacheProvider> {
    const isRedisHealthy = await this.redisCache.isHealthy();
    if (isRedisHealthy) {
      return this.redisCache;
    }
    return this.memoryCache;
  }

  async get<T = any>(key: string): Promise<T | null> {
    const provider = await this.getActiveProvider();
    const result = await provider.get<T>(key);
    if (result !== null) {
      this.logger.debug(`[CacheService] HIT key=${key} (provider=${provider.providerName})`);
    } else {
      this.logger.debug(`[CacheService] MISS key=${key} (provider=${provider.providerName})`);
    }
    return result;
  }

  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const provider = await this.getActiveProvider();
    this.logger.debug(`[CacheService] SET key=${key} (ttl=${ttlSeconds ?? 'none'}s, provider=${provider.providerName})`);
    return provider.set<T>(key, value, ttlSeconds);
  }

  async del(key: string): Promise<void> {
    const provider = await this.getActiveProvider();
    this.logger.debug(`[CacheService] DEL key=${key} (provider=${provider.providerName})`);
    return provider.del(key);
  }

  async reset(): Promise<void> {
    await this.memoryCache.reset();
    await this.redisCache.reset();
  }

  async isHealthy(): Promise<boolean> {
    return true; // Memory cache fallback ensures overall cache service is always available
  }
}
