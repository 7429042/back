import { Injectable } from '@nestjs/common';
import { SimpleRedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CategoryCacheService {
  private readonly IDS_TTL_S: number;
  private readonly READ_TTL_S: number;

  constructor(
    private readonly cache: SimpleRedisService,
    private readonly config: ConfigService,
  ) {
    this.IDS_TTL_S = this.getTTL('CATEGORIES_IDS_TTL_MS', 60_000);
    this.READ_TTL_S = this.getTTL('CATEGORIES_CACHE_TTL_MS', 120_000);
  }

  private getTTL(key: string, defaultMs: number): number {
    const ttlMs = Number(this.config.get(key));
    return Math.max(
      1,
      Math.floor(
        (Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : defaultMs) / 1000,
      ),
    );
  }

  getAllKey(): string {
    return 'categories:all';
  }

  getSearchKey(query: string, limit: number): string {
    return `categories:search:${query.toLowerCase()}:${limit}`;
  }

  getIdsKey(slug: string): string {
    return `categories:ids:${slug}`;
  }

  getParentCountersKey(): string {
    return 'categories:parent-counters';
  }

  async get<T>(key: string): Promise<T | null> {
    return this.cache.safeGet<T>(key);
  }

  async set(key: string, value: unknown, ttl: 'ids' | 'read'): Promise<void> {
    const ttlSeconds = ttl === 'ids' ? this.IDS_TTL_S : this.READ_TTL_S;
    await this.cache.safeSet(key, value, ttlSeconds);
  }

  // Инвалидация
  async invalidateAll(): Promise<void> {
    await this.cache.safeDel(this.getAllKey());
  }

  async invalidateIds(slug: string): Promise<void> {
    await this.cache.safeDel(this.getIdsKey(slug));
  }

  async invalidateParentCounters(): Promise<void> {
    await this.cache.safeDel(this.getParentCountersKey());
  }

  // Комплексная инвалидация при изменениях
  async invalidateOnChange(slugs: string[] = []): Promise<void> {
    await Promise.all([
      this.invalidateAll(),
      this.invalidateParentCounters(),
      ...slugs.map((slug) => this.invalidateIds(slug)),
    ]);
  }
}
