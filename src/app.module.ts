import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { HealthModule } from './health/health.module';
import { HealthController } from './health/health.controller';
import { MongoConnectionLogger } from './common/logging/mongo-connection.logger';
import { CategoriesModule } from './categories/categories.module';
import { ProgramsModule } from './programs/programs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
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
  ],
  controllers: [AppController],
  providers: [AppService, MongoConnectionLogger],
})
export class AppModule {
}
