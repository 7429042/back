import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';
import type { Response } from 'express';
import { TokensService } from './services/tokens.services';
import { CookiesService } from './services/cookies.service';
import { SessionsService } from './services/sessions.service';
import { AuthUtilsService } from './services/auth-utils';
import { BruteForceService } from './services/brute-force.service';
import { AuditEvent, AuditService } from './services/audit.service';

export type RevokeSessionResult = { success: true; message?: string };

@Injectable()
export class AuthService {
  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    private readonly tokens: TokensService,
    private readonly cookies: CookiesService,
    private readonly sessions: SessionsService,
    private readonly utils: AuthUtilsService,
    private readonly bruteForce: BruteForceService,
    private readonly audit: AuditService,
  ) {}

  async login(
    dto: LoginUserDto,
    meta?: { ip?: string; userAgent?: string },
    res?: Response,
  ) {
    const ip = meta?.ip || 'unknown';

    if (await this.bruteForce.isBlocked(dto.email, ip)) {
      const blockInfo = await this.bruteForce.getBlockInfo(dto.email, ip);
      const ttlMinutes = Math.ceil(blockInfo.emailTtl / 60);

      this.audit.logBruteForceBlock(dto.email, ip, blockInfo.emailAttempts);

      throw new ForbiddenException(
        `Too many failed login attempts. Please try again in ${ttlMinutes} minute(s).`,
      );
    }

    const user = await this.usersService.findByEmail(dto.email);
    if (!user) {
      await this.bruteForce.recordFailedAttempt(dto.email, ip);
      this.audit.logLoginFailed(dto.email, ip, 'User not found');
      throw new BadRequestException('Invalid email or password');
    }

    if (user.isBlocked) {
      this.audit.logLoginFailed(dto.email, ip, 'User is blocked');
      throw new ForbiddenException('User is blocked');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      await this.bruteForce.recordFailedAttempt(dto.email, ip);
      const blockInfo = await this.bruteForce.getBlockInfo(dto.email, ip);
      const remaining = Math.max(0, 5 - blockInfo.emailAttempts);

      this.audit.logLoginFailed(dto.email, ip, 'Invalid password');

      if (remaining > 0) {
        throw new BadRequestException(
          `Invalid email or password. ${remaining} attempt(s) remaining.`,
        );
      } else {
        throw new ForbiddenException(
          'Too many failed login attempts. Please try again in 15 minutes.',
        );
      }
    }

    await this.bruteForce.resetEmailAttempts(dto.email);

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const accessToken = this.tokens.signAccessToken(payload);
    const jti = randomUUID();
    const refreshToken = this.tokens.signRefreshToken(payload, jti);

    await this.sessions.createSession({
      userId: user._id,
      jti,
      refreshToken,
      expiresIn: this.tokens.decodeExpToDate(refreshToken),
      userAgent: meta?.userAgent,
      ip: meta?.ip,
      bcryptRounds: this.utils.getBcryptRounds(),
    });

    await this.sessions.enforceSessionLimit(user._id);

    this.audit.logLoginSuccess(
      user._id.toString(),
      user.email,
      ip,
      meta?.userAgent,
    );

    const obj = typeof user.toObject === 'function' ? user.toObject() : user;
    Reflect.deleteProperty(obj, 'passwordHash');
    if (res) this.cookies.setAuthCookies(res, accessToken, refreshToken);
    return {
      user: obj,
    };
  }

  async refreshToken(
    refreshTokenFromCookie?: string,
    meta?: { ip?: string; userAgent?: string },
    res?: Response,
  ) {
    if (!refreshTokenFromCookie)
      throw new UnauthorizedException('Refresh token is required');
    const decoded = await this.tokens
      .verifyRefresh<{
        sub: string;
        jti?: string;
        email?: string;
        role?: string;
      }>(refreshTokenFromCookie)
      .catch(() => null);

    if (!decoded || !decoded.jti)
      throw new UnauthorizedException('Invalid or expired refresh token');

    if (await this.sessions.isRevoked(decoded.jti)) {
      throw new UnauthorizedException('Refresh token is revoked');
    }

    const userDoc = await this.usersService.findAuthById(decoded.sub);
    if (!userDoc) throw new UnauthorizedException('User not found');
    if (userDoc.isBlocked) throw new ForbiddenException('User is blocked');

    const userId = new Types.ObjectId(decoded.sub);
    const session = await this.sessions.findSession(decoded.jti, userId);

    if (!session) {
      const ttl = this.tokens.ttlFromRefreshToken(refreshTokenFromCookie);
      if (ttl) await this.sessions.markRevokedInCache(decoded.jti, ttl);
      throw new UnauthorizedException(`Refresh session not found`);
    }

    const notExpired = session.expiresAt.getTime() >= Date.now();
    const notRevoked = !session.revokedAt;
    const same = await bcrypt.compare(
      refreshTokenFromCookie,
      session.tokenHash,
    );

    if (!same || !notExpired || !notRevoked) {
      await this.sessions.revokeAndCache(session);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    await this.sessions.revokeAndCache(session);

    const payload = {
      sub: decoded.sub,
      email: decoded.email,
      role: decoded.role,
    };
    const accessToken = this.tokens.signAccessToken(payload);
    const newJti = randomUUID();
    const newRefreshToken = this.tokens.signRefreshToken(payload, newJti);

    await this.sessions.createSession({
      userId,
      jti: newJti,
      refreshToken: newRefreshToken,
      expiresIn: this.tokens.decodeExpToDate(newRefreshToken),
      userAgent: meta?.userAgent,
      ip: meta?.ip,
      bcryptRounds: this.utils.getBcryptRounds(),
    });

    await this.sessions.enforceSessionLimit(userId);

    if (res) this.cookies.setAuthCookies(res, accessToken, newRefreshToken);
    return { success: true } as const;
  }

  async logout(refreshTokenFromCookie?: string, res?: Response) {
    // Ищем сессию по jti из токена, ставим revokedAt и пишем в Redis deny-list
    if (!refreshTokenFromCookie) {
      if (res) this.cookies.clearAuthCookies(res);
      return { success: true } as const;
    }
    const decoded = await this.tokens
      .verifyRefresh<{
        jti?: string;
        sub: string;
        email?: string;
        role?: string;
      }>(refreshTokenFromCookie)
      .catch(() => null);

    if (decoded?.jti) {
      const session = await this.sessions.findSession(
        decoded.jti,
        new Types.ObjectId(decoded.sub),
      );
      if (session) await this.sessions.revokeAndCache(session);
      this.audit.info(AuditEvent.LOGOUT, 'User logged out', {
        userId: decoded.sub,
        email: decoded.email,
      });
    }
    if (res) this.cookies.clearAuthCookies(res);
    return { success: true } as const;
  }

  async logoutAll(userId: string) {
    await this.sessions.revokeAll(new Types.ObjectId(userId));
    this.audit.info(AuditEvent.LOGOUT_ALL, 'User logged out from all devices', {
      userId,
    });
  }

  async listSessions(userId: string, refreshTokenFromCookie?: string) {
    const userObjectId = new Types.ObjectId(userId);
    const sessions = await this.sessions.listSessions(userObjectId);

    // Попробуем получить jti текущего refresh токена
    const decoded = refreshTokenFromCookie
      ? await this.tokens
          .verifyRefresh<{
            jti?: string;
            sub: string;
            email?: string;
            role?: string;
          }>(refreshTokenFromCookie)
          .catch(() => null)
      : null;

    const currentJti = decoded?.jti ?? null;

    return {
      data: sessions.map((s) => ({
        jti: s.jti,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        userAgent: s.userAgent,
        ip: s.ip,
        current: currentJti ? s.jti === currentJti : false,
      })),
    };
  }

  async revokeSession(
    userId: string,
    jti: string,
  ): Promise<RevokeSessionResult> {
    const session = await this.sessions.findSession(
      jti,
      new Types.ObjectId(userId),
    );
    if (!session || session.revokedAt) {
      return { success: true, message: 'Session not found or already revoked' };
    }
    await this.sessions.revokeAndCache(session);
    return { success: true } as const;
  }

  // Делегаты для совместимости с контроллером
  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    this.cookies.setAuthCookies(res, accessToken, refreshToken);
  }

  clearAuthCookies(res: Response) {
    this.cookies.clearAuthCookies(res);
  }
}
