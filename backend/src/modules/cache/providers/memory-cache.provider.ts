import { Injectable, Logger } from '@nestjs/common';
import { ICacheProvider } from '../interfaces/cache-provider.interface';

interface MemoryCacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

@Injectable()
export class MemoryCacheProvider implements ICacheProvider {
  readonly providerName = 'memory';
  private readonly logger = new Logger(MemoryCacheProvider.name);
  private readonly store = new Map<string, MemoryCacheEntry<any>>();

  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async reset(): Promise<void> {
    this.store.clear();
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}
