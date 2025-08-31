import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private getCookieOptions() {
    const secure = this.configService.get<boolean>('COOKIE_SECURE') ?? true;
    const sameSite =
      this.configService.get<'strict' | 'lax' | 'none'>('COOKIE_SAMESITE') ??
      'lax';
    const domain = this.configService.get<string>('COOKIE_DOMAIN');
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    return {
      httpOnly: true,
      secure,
      sameSite,
      domain,
      path: '/',
      maxAge,
    };
  }

  @Post('login')
  async login(
    @Body() dto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } =
      await this.authService.login(dto);
    res.cookie('refreshToken', refreshToken, this.getCookieOptions());
    return { user, accessToken };
  }

  @Post('refresh')
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const fromCookie =
      (req.cookies?.refreshToken as string | undefined) ?? null;
    const token = fromCookie ?? dto?.refreshToken;
    const { accessToken, refreshToken } =
      await this.authService.refreshToken(token);
    res.cookie('refreshToken', refreshToken, this.getCookieOptions());
    return { accessToken };
  }

  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  }
}
