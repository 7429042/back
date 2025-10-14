import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export type JsonReviver = (this: any, key: string, value: any) => any;
export type JsonReplacer = (this: any, key: string, value: any) => any;

@Injectable()
export class SimpleRedisService {
  private readonly logger = new Logger(SimpleRedisService.name);
  private readonly jsonReviver?: JsonReviver;
  private readonly jsonReplacer?: JsonReplacer;

  constructor(@Inject('REDIS') private readonly redis: Redis) {
    this.redis.on('connect', () => {
      this.logger.log('Redis connected');
    });
    this.redis.on('ready', () => {
      this.logger.log('Redis ready');
    });
    this.redis.on('error', (err) => {
      this.logger.error(`Redis error: ${err}`);
    });
    this.redis.on('end', () => {
      this.logger.log('Redis disconnected');
    });
    this.redis.on('reconnecting', () => {
      this.logger.log('Redis reconnecting');
    });
  }

  async onModuleDestroy() {
    try {
      await this.redis.quit();
      this.logger.log('Redis connection closed');
    } catch (err) {
      this.logger.error(`Redis close error: ${err}`);
      this.redis.disconnect();
    }
  }

  async set(key: string, value: unknown, ttlSeconds?: number) {
    try {
      const payload = JSON.stringify(value, this.jsonReplacer);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.redis.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, payload);
      }
    } catch (err) {
      this.logger.error(`Redis set error: ${err}`);
      throw err;
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const str = await this.redis.get(key);
    if (!str) return null;
    try {
      return JSON.parse(str, this.jsonReviver) as T;
    } catch (err) {
      this.logger.error(`Redis get error: ${err}`);
      return null;
    }
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async ping(): Promise<'PONG'> {
    const res = await this.redis.ping();
    if (res !== 'PONG') throw new Error('Redis ping failed');
    return 'PONG';
  }

  async safeGet<T = unknown>(key: string): Promise<T | null> {
    try {
      return await this.get<T>(key);
    } catch (err) {
      this.logger.warn(`Redis get error: ${err}`);
      return null;
    }
  }

  async safeSet(key: string, value: unknown, ttlSeconds?: number) {
    try {
      await this.set(key, value, ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis set error: ${err}`);
    }
  }

  async safeDel(key: string) {
    try {
      await this.del(key);
    } catch (err) {
      this.logger.warn(`Redis del error: ${err}`);
    }
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.safeGet<T>(key);
    if (cached) return cached;
    const fresh = await producer();
    await this.safeSet(key, fresh, ttlSeconds);
    return fresh;
  }
  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }
  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.redis.expire(key, ttlSeconds);
  }
}
