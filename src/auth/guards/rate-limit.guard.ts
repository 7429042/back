import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';
import { Request } from 'express';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly cache: SimpleRedisService,
  ) {}

  private getClientId(req: Request): string {
    const xff = req.headers?.['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length > 0) {
      const first = xff.split(',')[0].trim();
      if (first) return first;
    }
    return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const clientId = this.getClientId(req);
    const method = (req.method || 'ANY').toLowerCase();
    const path = req.originalUrl || 'unknown';
    const ttlSec = this.config.get<number>('RATE_LIMIT_TTL_SEC', 60);
    const max = this.config.get<number>('RATE_LIMIT_MAX', 10);
    const key = `rl:${method}:${path}:${clientId}`;
    let curr: number | undefined;

    try {
      curr = await this.cache.incr(key);
      if (curr === 1) {
        await this.cache.expire(key, ttlSec);
      }
    } catch {
      return true;
    }
    if ((curr ?? 0) > max) {
      throw new BadRequestException({ statusCode: 429 }, 'Too many requests');
    }
    return true;
  }
}
