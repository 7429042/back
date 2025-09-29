import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService, RevokeSessionResult } from './auth.service';
import { LoginUserDto } from './dto/login-user.dto';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserId } from './decorators/user-id.decorator';

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

  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body() dto: LoginUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    };
    const result = await this.authService.login(dto, meta, res);
    return result; // { user }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshTokenFromCookie = (req.cookies?.['refresh_token'] ??
      undefined) as string;
    const meta = {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    };
    await this.authService.refreshToken(refreshTokenFromCookie, meta, res);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshTokenFromCookie = (req.cookies?.['refresh_token'] ??
      undefined) as string;
    await this.authService.logout(refreshTokenFromCookie, res);
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
    // очистим куки текущей сессии
    res.cookie('access_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    res.cookie('refresh_token', '', { httpOnly: true, path: '/', maxAge: 0 });
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
    res.cookie('access_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    res.cookie('refresh_token', '', { httpOnly: true, path: '/', maxAge: 0 });
    return result;
  }
}
