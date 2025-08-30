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

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
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

  private signRefreshToken(payload: {
    sub: string;
    email?: string;
    role?: string;
  }) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '30d',
    );
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set\n');
    return this.jwtService.sign(payload, { secret, expiresIn });
  }

  async login(dto: LoginUserDto) {
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
    const refreshToken = this.signRefreshToken(payload);
    const obj = user.toObject();
    Reflect.deleteProperty(obj, 'passwordHash');
    return {
      user: obj,
      accessToken,
      refreshToken,
    };
  }

  async refreshToken(refreshToken: string) {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not set\n');
    try {
      const decoded = await this.jwtService.verifyAsync<{
        sub: string;
        email?: string;
        role?: string;
      }>(refreshToken, { secret });
      const payload = {
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
      };
      const accessToken = this.signAccessToken(payload);
      const newRefreshToken = this.signRefreshToken(payload);
      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
