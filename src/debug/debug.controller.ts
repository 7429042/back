import { Controller, Get, Query } from '@nestjs/common';
import { SimpleRedisService } from '../redis/redis.service';

@Controller('debug')
export class DebugController {
  constructor(private readonly cache: SimpleRedisService) {}

  @Get('set-cache')
  async setCache(@Query('k') k: string, @Query('v') v: string) {
    await this.cache.set(k, { value: v, ts: Date.now() }, 60);
    return { message: 'Cache set successfully' };
  }

  @Get('get-cache')
  async getCache(@Query('k') k: string) {
    const value = await this.cache.get(k);
    return { key: k, value };
  }
}
