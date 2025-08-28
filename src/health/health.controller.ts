import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  getHealth() {
    const state = Number(this.connection.readyState);
    const mongo = new Map<number, string>([
      [0, 'disconnected'],
      [1, 'connected'],
      [2, 'connecting'],
      [3, 'disconnecting'],
    ]);
    return {
      service: 'ok',
      mongo: {
        state,
        status: mongo.get(state) ?? 'unknown',
      },
    };
  }
}
