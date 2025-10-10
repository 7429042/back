import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { SimpleRedisService } from '../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly cache: SimpleRedisService,
  ) {}

  @Get()
  getHealth() {
    const state = Number(this.connection.readyState);
    const mongo = new Map<number, string>([
      [0, 'disconnected'],
      [1, 'connected'],
      [2, 'connecting'],
      [3, 'disconnecting'],
    ]);
    return {
      service: 'ok',
      mongo: {
        state,
        status: mongo.get(state) ?? 'unknown',
      },
    };
  }

  @Get('redis')
  async redisHealth() {
    const pong = await this.cache.ping();
    return { redis: pong };
  }
}
