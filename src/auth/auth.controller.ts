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
import { RateLimitGuard } from './guards/rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UseGuards(RateLimitGuard)
  async login(
    @Body() dto: LoginUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = {
      ip: req.ip,
      userAgent: req.headers['user-agent'] as string,
    };

    return await this.authService.login(dto, meta, res); // { user }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @UseGuards(RateLimitGuard)
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
  @UseGuards(RateLimitGuard)
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
    this.authService.clearAuthCookies(res);
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
    this.authService.clearAuthCookies(res);
    return result;
  }
}
