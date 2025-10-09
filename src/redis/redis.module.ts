import {Global, Module} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import Redis from 'ioredis';

@Global
@Module({
    providers: [
        {
            provide: 'REDIS',
            inject: [ConfigService],
            useFactory: (config: ConfigService) => {
                const host = config.get<string>('REDIS_HOST', '127.0.0.1');
                const port = Number(config.get<number>('REDIS_PORT', 6379));
                const db = Number(config.get<number>('REDIS_DB', 0));
                const password = config.get<string>('REDIS_PASSWORD');
                return new Redis({host, port, db, password: password || undefined})
            },
        },
      SimpleRedisService,
    ],
  exports: [
    'REDIS', SimpleRedisService
  ]
})