import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class MongoConnectionLogger {
  private readonly logger = new Logger(MongoConnectionLogger.name);

  constructor(@InjectConnection() private readonly connection: Connection) {
    // Мгновенно логируем текущее состояние при создании провайдера
    this.logCurrentState('init');

    // Подписываемся на ключевые события соединения
    this.connection.on('connected', () => {
      this.logger.log(
        `Mongo connected: db="${this.connection.name}" host=${this.connection.host}:${this.connection.port}`,
      );
    });

    this.connection.once('open', () => {
      this.logger.log('Mongo connection is open (ready for operations)');
    });

    this.connection.on('reconnected', () => {
      this.logger.warn('Mongo reconnected');
    });

    this.connection.on('disconnected', () => {
      this.logger.warn('Mongo disconnected');
    });

    this.connection.on('close', () => {
      this.logger.warn('Mongo connection closed');
    });

    this.connection.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Mongo connection error: ${msg}`);
    });
  }

  private logCurrentState(context: string) {
    const stateNum = Number(this.connection.readyState); // 0,1,2,3
    const stateTextMap: Record<number, string> = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting',
    };
    const stateText = stateTextMap[stateNum] || 'unknown';

    this.logger.log(
      `Mongo state at ${context}: ${stateText} (readyState=${stateNum})`,
    );
  }
}
