import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  RefreshSession,
  RefreshSessionDocument,
} from '../schemas/refresh-session.schema';
import { Model, Types } from 'mongoose';
import { SimpleRedisService } from '../../redis/redis.service';
import * as bcrypt from 'bcrypt';
import { AuthUtilsService } from './auth-utils';
import { SessionLean } from '../../common/types';

@Injectable()
export class SessionsService {
  constructor(
    @InjectModel(RefreshSession.name)
    private readonly refreshSessionModel: Model<RefreshSessionDocument>,
    private readonly cache: SimpleRedisService,
    private readonly utils: AuthUtilsService,
  ) {}

  private revokedKey(jti: string) {
    return `auth:refresh:revoked:${jti}`;
  }

  private msToSeconds(ms: number) {
    return Math.max(1, Math.floor(ms / 1000));
  }

  async createSession(params: {
    userId: Types.ObjectId;
    jti: string;
    refreshToken: string;
    expiresIn: Date;
    userAgent?: string;
    ip?: string;
    bcryptRounds: number;
  }) {
    const tokenHash = await bcrypt.hash(
      params.refreshToken,
      params.bcryptRounds,
    );
    await this.refreshSessionModel.create({
      user: params.userId,
      jti: params.jti,
      tokenHash,
      expiresAt: params.expiresIn,
      userAgent: params.userAgent,
      ip: params.ip,
    });
  }

  async findSession(jti: string, userId: Types.ObjectId) {
    return await this.refreshSessionModel.findOne({ jti, user: userId });
  }

  async revokeAndCache(session: RefreshSessionDocument) {
    if (!session.revokedAt) {
      session.revokedAt = new Date();
      await session.save();
      const ttlSec = this.msToSeconds(session.expiresAt.getTime() - Date.now());
      await this.cache.safeSet(this.revokedKey(session.jti), '1', ttlSec);
    }
  }

  async markRevokedInCache(jti: string, ttlSec: number) {
    if (ttlSec > 0) await this.cache.safeSet(this.revokedKey(jti), '1', ttlSec);
  }

  async isRevoked(jti: string) {
    return !!(await this.cache.safeGet<string>(this.revokedKey(jti)));
  }

  async enforceSessionLimit(userId: Types.ObjectId) {
    const max = this.utils.getNumber('REFRESH_MAX_SESSIONS', 5);
    const active = await this.refreshSessionModel
      .find({
        user: userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .sort({ createdAt: 1 })
      .select({ _id: 1, jti: 1, expiresAt: 1 })
      .lean<{ _id: Types.ObjectId; jti: string; expiresAt: Date }[]>()
      .exec();

    if (active.length <= max) return;

    const toRevoke = active.slice(0, active.length - max);
    const toRevokeIds = toRevoke.map((s) => s._id);

    await this.refreshSessionModel.updateMany(
      { _id: { $in: toRevokeIds } },
      { $set: { revokedAt: new Date() } },
    );

    await Promise.all(
      toRevoke.map((s) => {
        const ttlSec = this.msToSeconds(
          new Date(s.expiresAt).getTime() - Date.now(),
        );
        return this.cache.safeSet(this.revokedKey(s.jti), '1', ttlSec);
      }),
    );
  }

  async listSessions(userId: Types.ObjectId): Promise<SessionLean[]> {
    type Row = {
      jti: string;
      createdAt: Date | string;
      expiresAt: Date | string;
      userAgent?: string;
      ip?: string;
    };

    const rows = await this.refreshSessionModel
      .find({
        user: userId,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
      })
      .select({ jti: 1, createdAt: 1, expiresAt: 1, userAgent: 1, ip: 1 })
      .sort({ createdAt: -1 })
      .lean<Row[]>()
      .exec();

    const toDate = (v: Date | string): Date =>
      v instanceof Date ? v : new Date(v);

    return rows.map((r) => ({
      jti: r.jti,
      createdAt: toDate(r.createdAt),
      expiresAt: toDate(r.expiresAt),
      userAgent: r.userAgent,
      ip: r.ip,
    }));
  }

  async revokeAll(userId: Types.ObjectId) {
    await this.refreshSessionModel.updateMany(
      { user: userId, revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } },
    );
    // при желании — проставьте ключи ревока в Redis с соответствующим TTL
  }
}
