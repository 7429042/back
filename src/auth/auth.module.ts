import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './srtategies/jwt.strategy';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { MongooseModule } from '@nestjs/mongoose';
import {
  RefreshSession,
  RefreshSessionSchema,
} from './schemas/refresh-session.schema';
import { RedisModule } from '../redis/redis.module';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { TokensService } from './services/tokens.services';
import { CookiesService } from './services/cookies.service';
import { SessionsService } from './services/sessions.service';
import { AuthUtilsService } from './services/auth-utils';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ConfigModule,
    forwardRef(() => UsersModule),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const secret = config.get<string>('JWT_SECRET');
        const expiresInRaw = config.get<string>('JWT_EXPIRES_IN') ?? '1h';
        if (!secret) {
          throw new Error('JWT_SECRET is not set\n');
        }
        const expiresIn = expiresInRaw as JwtSignOptions['expiresIn'];
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
    }),
    MongooseModule.forFeature([
      { name: RefreshSession.name, schema: RefreshSessionSchema },
    ]),
    RedisModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    RateLimitGuard,
    TokensService,
    CookiesService,
    SessionsService,
    AuthUtilsService,
  ],
  exports: [PassportModule, AuthService],
})
export class AuthModule {}
