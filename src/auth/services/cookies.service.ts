import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import { AuthUtilsService } from './auth-utils';

@Injectable()
export class CookiesService {
  constructor(
    private readonly configService: ConfigService,
    private readonly utils: AuthUtilsService,
  ) {}

  private getCookieFlags() {
    const isProd = this.configService.get<string>('NODE_ENV') === 'production';
    const secure = isProd
      ? true
      : this.utils.getBoolean('COOKIE_SECURE', false);
    const sameSite: CookieOptions['sameSite'] = isProd ? 'none' : 'lax';
    const domain = this.configService.get<string>('COOKIE_DOMAIN') || undefined;
    return { secure, sameSite, domain };
  }

  private getAccessMaxAgeMs() {
    return this.utils.getNumber('ACCESS_TOKEN_MAX_AGE_MS', 15 * 60 * 1000);
  }

  private getRefreshMaxAgeMs() {
    return this.utils.getNumber(
      'REFRESH_TOKEN_MAX_AGE_MS',
      30 * 24 * 60 * 60 * 1000,
    );
  }

  setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
    const { secure, sameSite, domain } = this.getCookieFlags();
    const base: CookieOptions = {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      domain,
    };
    res.cookie('access_token', accessToken, {
      ...base,
      maxAge: this.getAccessMaxAgeMs(),
    });
    res.cookie('refresh_token', refreshToken, {
      ...base,
      maxAge: this.getRefreshMaxAgeMs(),
    });
  }

  clearAuthCookies(res: Response) {
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
}
