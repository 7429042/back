import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthModule } from './health/health.module';
import { ServeStaticModule } from '@nestjs/serve-static';
import { MongoConnectionLogger } from './common/logging/mongo-connection.logger';
import { CategoriesModule } from './categories/categories.module';
import { ProgramsModule } from './programs/programs.module';
import { UsersModule } from './users/users.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import * as Joi from 'joi';
import { join } from 'path';
import { RedisModule } from './redis/redis.module';
import { DebugController } from './debug/debug.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(4200),
        MONGODB_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().min(16).required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        JWT_REFRESH_SECRET: Joi.string().min(16).required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),
        HOURS_PER_DAY: Joi.number().integer().min(1).max(24).default(8),
        ADMIN_EMAIL: Joi.string().email().optional(),
        ADMIN_PASSWORD: Joi.string().min(8).optional(),
        ADMIN_FIRST_NAME: Joi.string().optional(),
        ADMIN_LAST_NAME: Joi.string().optional(),
        CORS_ORIGIN: Joi.alternatives()
          .try(Joi.string(), Joi.boolean())
          .optional(),
        CORS_ORIGIN_LIST: Joi.string().optional(),
        COOKIE_DOMAIN: Joi.string().optional(),
        COOKIE_SECURE: Joi.boolean().default(true),
        COOKIE_SAMESITE: Joi.string()
          .valid('strict', 'lax', 'none')
          .default('lax'),
        REFRESH_MAX_SESSIONS: Joi.number().integer().min(1).max(50).default(5),
        CATEGORIES_IDS_TTL_MS: Joi.number().integer().min(1000).default(60000),
        CATEGORIES_CACHE_TTL_MS: Joi.number()
          .integer()
          .min(1000)
          .default(120000),
        RATE_LIMIT_TTL_SEC: Joi.number().integer().min(1).max(3600).default(60),
        RATE_LIMIT_MAX: Joi.number().integer().min(1).max(1000).default(10),
        CSRF_HMAC_SECRET: Joi.string().min(16).required(),
      }),

    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    RedisModule,
    HealthModule,
    CategoriesModule,
    ProgramsModule,
    UsersModule,
    ApplicationsModule,
    AuthModule,
    CartModule,
  ],
  controllers: [AppController, DebugController],
  providers: [AppService, MongoConnectionLogger],
})
export class AppModule {}
