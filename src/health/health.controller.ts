import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';


@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {
  }

  @Get()
  getHealth() {
    const state = this.connection.readyState;
    const mongo = state === 1 ? 'connected' : state === 2 ? 'connecting' : state === 3 ? 'disconnecting' : 'disconnected';
    return { service: 'ok', mongo };
  }

}
