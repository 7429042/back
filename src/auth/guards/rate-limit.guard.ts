import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';
import { Request, Response } from 'express';
import { AuditService } from '../services/audit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  constructor(
    private readonly config: ConfigService,
    private readonly cache: SimpleRedisService,
    private readonly audit: AuditService,
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
    const res = ctx.switchToHttp().getResponse<Response>();

    const clientId = this.getClientId(req);
    const method = (req.method || 'ANY').toLowerCase();
    const path = req.originalUrl || 'unknown';

    const ttlSec = this.config.get<number>('RATE_LIMIT_TTL_SEC', 60);
    const max = this.config.get<number>('RATE_LIMIT_MAX', 10);
    const key = `rl:${method}:${path}:${clientId}`;

    let curr: number;
    let ttl: number;

    try {
      curr = await this.cache.incr(key);
      if (curr === 1) {
        await this.cache.expire(key, ttlSec);
        ttl = ttlSec;
      } else {
        ttl = (await this.cache.ttl(key)) || ttlSec;
      }
    } catch (err) {
      this.logger.error('Redis error:', err);
      throw new HttpException(
        'Service temporarily unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    res.setHeader('X-RateLimit-Limit', max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - curr).toString());
    res.setHeader('X-RateLimit-Reset', (Date.now() + ttl * 1000).toString());

    if (curr > max) {
      res.setHeader('Retry-After', ttl.toString());
      this.logger.warn('Rate limit exceeded for client:', clientId);

      this.audit.logRateLimitExceeded(clientId, path, method);

      throw new HttpException(
        'Too many requests',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
