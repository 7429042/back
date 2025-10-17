import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import type { Request } from 'express';
import { SimpleRedisService } from '../../redis/redis.service';

export type JwtPayload = {
  sub: string;
  email?: string;
  role?: string;
};

function extractJwtFromCookie(req: Request): string | null {
  const raw = req?.cookies?.['access_token'] as unknown;
  const token = typeof raw === 'string' ? raw : null;
  return token && token.length > 0 ? token : null;
}

interface UserAuthStatus {
  exists: boolean;
  isBlocked: boolean;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
    private readonly cache: SimpleRedisService,
  ) {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not set');
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        extractJwtFromCookie,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  private getUserStatusCacheKey(userId: string): string {
    return `user:auth:status:${userId}`;
  }

  private async getUserAuthStatus(
    userId: string,
  ): Promise<UserAuthStatus | null> {
    const cacheKey = this.getUserStatusCacheKey(userId);

    // Пытаемся получить из кэша (TTL: 5 минут)
    const cached = await this.cache.safeGet<UserAuthStatus>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    // Если нет в кэше - запрашиваем из БД
    try {
      const user = await this.usersService.findAuthById(userId);

      if (!user) {
        // Пользователь не найден - кэшируем на 1 минуту
        const notFoundStatus: UserAuthStatus = {
          exists: false,
          isBlocked: false,
        };
        await this.cache.safeSet(cacheKey, notFoundStatus, 60);
        return notFoundStatus;
      }
      const status: UserAuthStatus = {
        exists: true,
        isBlocked: user.isBlocked || false,
        role: user.role,
      };
      await this.cache.safeSet(cacheKey, status, 300); // 5 минут
      return status;
    } catch (error) {
      // При ошибке БД возвращаем null (пропустим запрос без проверки)
      console.error('Error fetching user auth status:', error);
      return null;
    }
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const userStatus = await this.getUserAuthStatus(payload.sub);

    if (userStatus === null) {
      return payload;
    }

    if (!userStatus.exists) {
      throw new UnauthorizedException('User not found');
    }

    if (userStatus.isBlocked) {
      throw new UnauthorizedException('User is blocked');
    }

    if (userStatus.role && userStatus.role !== payload.role) {
      return { ...payload, role: userStatus.role };
    }

    return payload;
  }
}
