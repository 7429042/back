import { forwardRef, Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './schemas/userSchema';
import { JwtModule, JwtModuleOptions, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AuthUtilsService } from '../auth/services/auth-utils';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AuthUtilsService],
  imports: [
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    forwardRef(() => AuthModule),
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
  ],
  exports: [UsersService],
})
export class UsersModule {}
