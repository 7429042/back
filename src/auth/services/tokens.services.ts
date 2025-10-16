import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokensService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  signAccessToken(payload: { sub: string; email?: string; role?: string }) {
    const secret = this.configService.get<string>('JWT_SECRET');
    const expiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '1h',
    ) as JwtSignOptions['expiresIn'];
    if (!secret) throw new Error('JWT_SECRET is not set');
    return this.jwtService.sign(payload, { secret, expiresIn });
  }

  signRefreshToken(
    payload: { sub: string; email?: string; role?: string },
    jti: string,
  ) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    ) as JwtSignOptions['expiresIn'];
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
    return this.jwtService.sign({ ...payload, jti }, { secret, expiresIn });
  }

  async verifyRefresh<
    T extends { sub: string; jti?: string; email?: string; role?: string },
  >(token: string) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set');
    return await this.jwtService.verifyAsync<T>(token, { secret });
  }

  private isJwtWithExp(payload: unknown): payload is { exp: number } {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'exp' in payload &&
      typeof (payload as { exp: unknown }).exp === 'number'
    );
  }

  decodeExpToDate(token: string): Date {
    const decoded: unknown = this.jwtService.decode(token);
    const expSec = this.isJwtWithExp(decoded) ? decoded.exp : undefined;

    if (expSec === undefined) {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      return new Date(Date.now() + thirtyDaysMs);
    }
    return new Date(expSec * 1000);
  }

  ttlFromRefreshToken(token: string): number | null {
    const decoded: unknown = this.jwtService.decode(token);
    const expSec = this.isJwtWithExp(decoded) ? decoded.exp : undefined;
    if (!expSec) return null;
    const ms = expSec * 1000 - Date.now();
    return ms > 0 ? Math.max(1, Math.floor(ms / 1000)) : null;
  }
}
