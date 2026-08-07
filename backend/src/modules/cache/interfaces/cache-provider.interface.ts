export interface ICacheProvider {
  readonly providerName: string;
  get<T = any>(key: string): Promise<T | null>;
  set<T = any>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  reset(): Promise<void>;
  isHealthy(): Promise<boolean>;
}
