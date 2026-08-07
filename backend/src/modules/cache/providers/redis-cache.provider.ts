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
    const host = this.config.get<string>('REDIS_HOST') || 'localhost';
    const port = parseInt(this.config.get<string>('REDIS_PORT') || '6379', 10);
    const password = this.config.get<string>('REDIS_PASSWORD') || undefined;

    try {
      this.client = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) return null; // Stop retrying after 3 attempts
          return Math.min(times * 100, 1000);
        },
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        this.logger.log(`[RedisCache] Connected to ${host}:${port}`);
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        this.logger.warn(`[RedisCache] Connection error: ${err.message}`);
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
