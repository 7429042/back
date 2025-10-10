import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class SimpleRedisService {
  private readonly logger = new Logger(SimpleRedisService.name);
  constructor(@Inject('REDIS') private readonly redis: Redis) {}

  async set(key: string, value: unknown, ttlSeconds?: number) {
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await this.redis.set(key, payload, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, payload);
    }
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const str = await this.redis.get(key);
    return str ? (JSON.parse(str) as T) : null;
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
      this.logger.error(`Redis get error: ${err}`);
      return null;
    }
  }

  async safeSet(key: string, value: unknown, ttlSeconds?: number) {
    try {
      await this.set(key, value, ttlSeconds);
    } catch (err) {
      this.logger.error(`Redis set error: ${err}`);
    }
  }

  async safeDel(key: string) {
    try {
      await this.del(key);
    } catch (err) {
      this.logger.error(`Redis del error: ${err}`);
    }
  }
}
