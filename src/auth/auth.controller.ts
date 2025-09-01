import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService, RevokeSessionResult } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserId } from './user-id.decorator';

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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshToken } = await this.authService.login(
      dto,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
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
    const { accessToken, refreshToken } = await this.authService.refreshToken(
      token,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
    res.cookie('refreshToken', refreshToken, this.getCookieOptions());
    return { accessToken };
  }

  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token =
      (req.cookies?.refreshToken as string | undefined) ?? undefined;
    await this.authService.logout(token);
    res.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @UserId() userId: string,
  ) {
    await this.authService.logoutAll(userId);
    res.clearCookie('refreshToken', { path: '/' });
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async listSessions(@UserId() userId: string) {
    return await this.authService.listSessions(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('revoke/:jti')
  async revokeSession(
    @UserId() userId: string,
    @Param('jti') jti: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RevokeSessionResult> {
    const result: RevokeSessionResult = await this.authService.revokeSession(
      userId,
      jti,
    );
    res.clearCookie('refreshToken', { path: '/' });
    return result;
  }
}
