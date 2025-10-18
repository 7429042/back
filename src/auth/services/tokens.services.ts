import { Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokensService implements OnModuleInit {
  private jwtSecret!: string;
  private jwtExpiresIn!: JwtSignOptions['expiresIn'];
  private jwtRefreshSecret!: string;
  private jwtRefreshExpiresIn!: JwtSignOptions['expiresIn'];

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET')!;
    this.jwtRefreshSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET')!;

    if (!this.jwtSecret) throw new Error('JWT_SECRET is not set');
    if (!this.jwtRefreshSecret)
      throw new Error('JWT_REFRESH_SECRET is not set');

    this.jwtExpiresIn = this.configService.get<string>(
      'JWT_EXPIRES_IN',
      '1h',
    ) as JwtSignOptions['expiresIn'];

    this.jwtRefreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    ) as JwtSignOptions['expiresIn'];

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      console.log(
        `[TokensService] Initialized with TTL: ` +
          `access=${this.jwtExpiresIn}, refresh=${this.jwtRefreshExpiresIn}`,
      );
    }
  }

  signAccessToken(payload: { sub: string; email?: string; role?: string }) {
    return this.jwtService.sign(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn,
    });
  }

  signRefreshToken(
    payload: { sub: string; email?: string; role?: string },
    jti: string,
  ) {
    return this.jwtService.sign(
      { ...payload, jti },
      { secret: this.jwtRefreshSecret, expiresIn: this.jwtRefreshExpiresIn },
    );
  }

  async verifyRefresh<
    T extends { sub: string; jti?: string; email?: string; role?: string },
  >(token: string) {
    return await this.jwtService.verifyAsync<T>(token, {
      secret: this.jwtRefreshSecret,
    });
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
