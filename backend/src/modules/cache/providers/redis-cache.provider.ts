import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ICacheProvider } from '../interfaces/cache-provider.interface';

@Injectable()
export class RedisCacheProvider implements ICacheProvider {
  readonly providerName = 'redis';
  private readonly logger = new Logger(RedisCacheProvider.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL') || process.env.REDIS_URL;
    const host = this.config.get<string>('REDIS_HOST') || process.env.REDIS_HOST || '127.0.0.1';
    const port = parseInt(this.config.get<string>('REDIS_PORT') || process.env.REDIS_PORT || '6379', 10);
    const password = this.config.get<string>('REDIS_PASSWORD') || process.env.REDIS_PASSWORD || undefined;

    try {
      const redisOptions = {
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: (times: number) => {
          if (times > 3) return null; // Stop retrying after 3 attempts
          return Math.min(times * 200, 1000);
        },
      };

      if (redisUrl) {
        this.client = new Redis(redisUrl, redisOptions);
      } else {
        this.client = new Redis({
          host,
          port,
          password,
          ...redisOptions,
        });
      }

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`[RedisCache] Connected to Redis (${redisUrl ? 'REDIS_URL' : `${host}:${port}`})`);
      });

      let errorCount = 0;
      this.client.on('error', (err) => {
        this.isConnected = false;
        errorCount++;
        if (errorCount <= 3) {
          this.logger.warn(`[RedisCache] Connection error (${errorCount}/3): ${err.message}`);
        }
      });
    } catch (err: any) {
      this.logger.warn(`[RedisCache] Redis initialization skipped: ${err.message}`);
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) return null;
    try {
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, payload);
      } else {
        await this.client.set(key, payload);
      }
    } catch (err: any) {
      this.logger.warn(`[RedisCache] set failed for key=${key}: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.del(key);
    } catch {}
  }

  async reset(): Promise<void> {
    if (!this.client || !this.isConnected) return;
    try {
      await this.client.flushdb();
    } catch {}
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.isConnected) return false;
    try {
      const pong = await this.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }
}
