import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class SimpleRedisService {
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

  async ping() {
    return this.redis.ping();
  }
}
