import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { LoginUserDto } from './dto/login-user.dto';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import { InjectModel } from '@nestjs/mongoose';
import {
  RefreshSession,
  RefreshSessionDocument,
} from './schemas/refresh-session.schema';
import { Model, Types } from 'mongoose';
import type { Response, CookieOptions } from 'express';

export type RevokeSessionResult = { success: true; message?: string };

type SessionLean = {
  jti: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => UsersService))
    private readonly usersService: UsersService,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
  ) {}

  private getCookieFlags() {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const secure = isProd
      ? true
      : this.configService.get<boolean>('COOKIE_SECURE', false);
    const sameSite: CookieOptions['sameSite'] = isProd ? 'none' : 'lax';
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    return { secure, sameSite, domain };
  }

  private getAccessMaxAgeMs() {
    const ms = this.configService.get<number>('ACCESS_TOKEN_MAX_AGE_MS');
    if (typeof ms === 'number') return ms;
    return 15 * 60 * 1000;
  }

  private getRefreshMaxAgeMs() {
    const ms = this.configService.get<number>('REFRESH_TOKEN_MAX_AGE_MS');
    if (typeof ms === 'number') return ms;
    return 30 * 24 * 60 * 60 * 1000;
  }

  private setAuthCookies(
    res: Response,
    accessToken: string,
    refreshToken: string,
  ) {
    const { secure, sameSite, domain } = this.getCookieFlags();
    const accessMaxAge = this.getAccessMaxAgeMs();
    const refreshMaxAge = this.getRefreshMaxAgeMs();

    const base: CookieOptions = {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      domain, // если undefined, Express не добавит домен
    };

    res.cookie('access_token', accessToken, { ...base, maxAge: accessMaxAge });
    res.cookie('refresh_token', refreshToken, {
      ...base,
      maxAge: refreshMaxAge,
    });
  }

  public clearAuthCookies(res: Response) {
    const { secure, sameSite, domain } = this.getCookieFlags();
    const base: CookieOptions = {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      domain,
      maxAge: 0,
    };
    res.cookie('access_token', '', base);
    res.cookie('refresh_token', '', base);
  }

  private getBcryptRounds(): number {
    return this.configService.get<number>('BCRYPT_ROUNDS', 10);
  }

  private signAccessToken(payload: {
    sub: string;
    email?: string;
    role?: string;
  }) {
    const secret = this.configService.get<string>('JWT_SECRET');
    const expiresIn = this.configService.get<string>('JWT_EXPIRES_IN', '1h');
    return this.jwtService.sign(payload, {
      secret,
      expiresIn,
    });
  }

  private signRefreshToken(
    payload: {
      sub: string;
      email?: string;
      role?: string;
    },
    jti: string,
  ) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    );
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
    return this.jwtService.sign({ ...payload, jti }, { secret, expiresIn });
  }

  private isJwtWithExp(payload: unknown): payload is { exp: number } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof (payload as { exp: unknown }).exp === 'number'
    );
  }

  private decodeExpToDate(token: string): Date {
    const decoded: unknown = this.jwtService.decode(token);
    const expSec = this.isJwtWithExp(decoded) ? decoded.exp : undefined;

    if (expSec === undefined) {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      return new Date(Date.now() + thirtyDaysMs);
    }
    return new Date(expSec * 1000);
  }

  private isJwtWithJti(payload: unknown): payload is { jti: string } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'jti' in payload &&
      typeof (payload as { jti: unknown }).jti === 'string'
    );
  }

  private isSessionLeanArray(value: unknown): value is SessionLean[] {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return true;
    const e = value[0] as Record<string, unknown>;
    return (
      typeof e?.jti === 'string' &&
      (e?.createdAt instanceof Date || typeof e?.createdAt === 'string') &&
      (e?.expiresAt instanceof Date || typeof e?.expiresAt === 'string')
    );
  }

  private async enforceSessionLimit(userId: Types.ObjectId) {
    const max = this.configService.get<number>('REFRESH_MAX_SESSIONS', 5);
    const active = await this.refreshSessionModel
      .find({
        user: userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: 1 })
      .select({ _id: 1 })
      .lean()
      .exec();

    if (active.length <= max) return;

    const toRevokeIds = active.slice(0, active.length - max).map((s) => s._id);

    await this.refreshSessionModel.updateMany(
      { _id: { $in: toRevokeIds } },
      { $set: { revokedAt: new Date() } },
    );
  }

  async login(
    dto: LoginUserDto,
    meta?: { ip?: string; userAgent?: string },
    res?: Response,
  ) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new BadRequestException('Invalid email or password');

    if (user.isBlocked) {
      throw new ForbiddenException('User is blocked');
    }

    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) throw new BadRequestException('Invalid email or password');

    const payload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    };
    const accessToken = this.signAccessToken(payload);
    const jti = randomUUID();
    const refreshToken = this.signRefreshToken(payload, jti);

    const expiresAt = this.decodeExpToDate(refreshToken);
    const tokenHash = await bcrypt.hash(refreshToken, 10);

    await this.refreshSessionModel.create({
      user: user._id,
      jti,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    await this.enforceSessionLimit(user._id);

    const obj = user.toObject();
    Reflect.deleteProperty(obj, 'passwordHash');
    if (res) this.setAuthCookies(res, accessToken, refreshToken);
    return {
      user: obj,
    };
  }

  async refreshToken(
    refreshTokenFromCookie?: string,
    meta?: { ip?: string; userAgent?: string },
    res?: Response,
  ) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set\n');
    try {
      const refreshToken = refreshTokenFromCookie;
      if (!refreshToken) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const decoded = await this.jwtService.verifyAsync<{
        sub: string;
        email?: string;
        role?: string;
        jti?: string;
      }>(refreshToken, { secret });

      if (!decoded.jti)
        throw new UnauthorizedException('Invalid or expired refresh token');

      const user = await this.usersService.findById(decoded.sub);
      if (!user) throw new UnauthorizedException('User not found');
      if (user.isBlocked) {
        throw new ForbiddenException('User is blocked');
      }

      const session = await this.refreshSessionModel.findOne({
        jti: decoded.jti,
        user: new Types.ObjectId(decoded.sub),
      });

      if (!session)
        throw new UnauthorizedException('Refresh session not found');

      if (session.revokedAt) {
        throw new UnauthorizedException('Refresh session revoked');
      }

      if (session.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException('Refresh session expired');
      }

      const same = await bcrypt.compare(refreshToken, session.tokenHash);
      if (!same) {
        session.revokedAt = new Date();
        await session.save();
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      session.revokedAt = new Date();
      await session.save();

      const payload = {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
      const accessToken = this.signAccessToken(payload);
      const newJti = randomUUID();
      const newRefreshToken = this.signRefreshToken(payload, newJti);
      const expiresAt = this.decodeExpToDate(newRefreshToken);
      const tokenHash = await bcrypt.hash(newRefreshToken, 10);

      const userObjectId = new Types.ObjectId(decoded.sub);

      await this.refreshSessionModel.create({
        user: new Types.ObjectId(decoded.sub),
        jti: newJti,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent,
        ip: meta?.ip,
      });

      await this.enforceSessionLimit(userObjectId);

      if (res) {
        this.setAuthCookies(res, accessToken, newRefreshToken);
      }

      return { success: true };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(refreshTokenFromCookie?: string, res?: Response) {
    if (refreshTokenFromCookie) {
      const decoded: unknown = this.jwtService.decode(refreshTokenFromCookie);
      const jti = this.isJwtWithJti(decoded) ? decoded.jti : undefined;
      if (jti) {
        await this.refreshSessionModel.updateOne(
          { jti },
          { $set: { revokedAt: new Date() } },
        );
      }
    }
    if (res) {
      this.clearAuthCookies(res);
    }
    return { success: true };
  }

  async logoutAll(userId: string) {
    await this.refreshSessionModel.updateMany(
      {
        user: new Types.ObjectId(userId),
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } },
    );
    return { success: true };
  }

  async listSessions(userId: string, currentTokenFromCookie?: string) {
    const userObjectId = new Types.ObjectId(userId);
    let currentJti: string | undefined;
    if (currentTokenFromCookie) {
      try {
        const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
        if (secret) {
          const decoded = await this.jwtService.verifyAsync<{
            jti?: string;
          }>(currentTokenFromCookie, { secret });
          if (decoded.jti) currentJti = decoded.jti;
        }
      } catch {
        /* empty */
      }
    }
    const raw = await this.refreshSessionModel
      .find({
        user: userObjectId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .select({
        jti: 1,
        createdAt: 1,
        expiresAt: 1,
        userAgent: 1,
        ip: 1,
      })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const sessions: SessionLean[] = this.isSessionLeanArray(raw) ? raw : [];

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
    const userObjectId = new Types.ObjectId(userId);
    const res = await this.refreshSessionModel.updateOne(
      {
        user: userObjectId,
        jti,
        revokedAt: { $exists: false },
      },
      { $set: { revokedAt: new Date() } },
    );
    if (res.matchedCount === 0) {
      return { success: true, message: 'Session not found or already revoked' };
    }
    return { success: true };
  }
}
