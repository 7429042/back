import {
  BadRequestException,
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

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
  ) {}

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

  async login(dto: LoginUserDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new BadRequestException('Invalid email or password');

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

    const userObjectId = new Types.ObjectId(user._id);

    await this.refreshSessionModel.create({
      user: new Types.ObjectId(user._id),
      jti,
      tokenHash,
      expiresAt,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    await this.enforceSessionLimit(userObjectId);

    const obj = user.toObject();
    Reflect.deleteProperty(obj, 'passwordHash');
    return {
      user: obj,
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(
    refreshToken: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set\n');
    try {
      const decoded = await this.jwtService.verifyAsync<{
        sub: string;
        email?: string;
        role?: string;
        jti?: string;
      }>(refreshToken, { secret });

      if (!decoded.jti)
        throw new UnauthorizedException('Invalid or expired refresh token');

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

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { success: true };
    const decoded: unknown = this.jwtService.decode(refreshToken);
    const jti = this.isJwtWithJti(decoded) ? decoded.jti : undefined;
    if (!jti) return { success: true };
    await this.refreshSessionModel.updateOne(
      { jti },
      { $set: { revokedAt: new Date() } },
    );
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
}
