import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthModule } from './health/health.module';
import { MongoConnectionLogger } from './common/logging/mongo-connection.logger';
import { CategoriesModule } from './categories/categories.module';
import { ProgramsModule } from './programs/programs.module';
import { UsersModule } from './users/users.module';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import Joi from 'joi';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      validationSchema: Joi.object({
        PORT: Joi.number().default(3000),
        MONGODB_URI: Joi.string().required(),
        JWT_SECRET: Joi.string().min(16).required(),
        JWT_EXPIRES_IN: Joi.string().required(),
        HOURS_PER_DAY: Joi.number().integer().min(1).max(24).default(8),
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('MONGODB_URI'),
      }),
    }),
    HealthModule,
    CategoriesModule,
    ProgramsModule,
    UsersModule,
    ApplicationsModule,
    AuthModule,
    CartModule,
  ],
  controllers: [AppController],
  providers: [AppService, MongoConnectionLogger],
})
export class AppModule {}
