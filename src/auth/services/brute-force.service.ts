import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';

@Injectable()
export class BruteForceService {
  private readonly logger = new Logger(BruteForceService.name);
  private readonly maxEmailAttempts: number;
  private readonly maxIpAttempts: number;
  private readonly blockTtlSec: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly cache: SimpleRedisService,
  ) {
    this.maxEmailAttempts = this.configService.get<number>(
      'BRUTE_FORCE_MAX_EMAIL_ATTEMPTS',
      5,
    );
    this.maxIpAttempts = this.configService.get<number>(
      'BRUTE_FORCE_MAX_IP_ATTEMPTS',
      20,
    );
    this.blockTtlSec = this.configService.get<number>(
      'BRUTE_FORCE_BLOCK_TTL_SEC',
      900,
    );
  }

  private getEmailKey(email: string): string {
    return `auth:attempts:email:${email.toLowerCase().trim()}`;
  }

  private getIpKey(ip: string): string {
    return `auth:attempts:ip:${ip}`;
  }
  async recordFailedAttempt(email: string, ip: string): Promise<void> {
    const emailKey = this.getEmailKey(email);
    const ipKey = this.getIpKey(ip);

    try {
      // Увеличиваем оба счетчика параллельно
      const [emailCount, ipCount] = await Promise.all([
        this.cache.incr(emailKey),
        this.cache.incr(ipKey),
      ]);

      // Устанавливаем TTL для новых ключей
      const ttlPromises: Promise<number>[] = [];

      if (emailCount === 1) {
        ttlPromises.push(this.cache.expire(emailKey, this.blockTtlSec));
      }

      if (ipCount === 1) {
        ttlPromises.push(this.cache.expire(ipKey, this.blockTtlSec));
      }

      if (ttlPromises.length > 0) {
        await Promise.all(ttlPromises);
      }
      this.logger.warn(
        `Failed login attempt: email=${email}, ip=${ip}, ` +
          `emailAttempts=${emailCount}, ipAttempts=${ipCount}`,
      );
    } catch (error) {
      // Не прерываем процесс логина при ошибке Redis
      this.logger.error(`Error recording failed attempt: ${error}`);
    }
  }

  async isBlocked(email: string, ip: string): Promise<boolean> {
    const emailKey = this.getEmailKey(email);
    const ipKey = this.getIpKey(ip);

    try {
      // Получаем счетчики параллельно
      const [emailAttempts, ipAttempts] = await Promise.all([
        this.cache.safeGet<string>(emailKey),
        this.cache.safeGet<string>(ipKey),
      ]);

      // Преобразуем в числа
      const emailCount = emailAttempts ? parseInt(emailAttempts, 10) : 0;
      const ipCount = ipAttempts ? parseInt(ipAttempts, 10) : 0;

      // Проверяем оба лимита
      const emailBlocked = emailCount >= this.maxEmailAttempts;
      const ipBlocked = ipCount >= this.maxIpAttempts;

      if (emailBlocked || ipBlocked) {
        this.logger.warn(
          `Login blocked: email=${email}, ip=${ip}, ` +
            `emailAttempts=${emailCount}/${this.maxEmailAttempts}, ` +
            `ipAttempts=${ipCount}/${this.maxIpAttempts}`,
        );
        return true;
      }
      return false;
    } catch (error) {
      // При ошибке Redis НЕ блокируем вход (fail-open для этого случая)
      // Это отличается от Rate Limiting, где мы блокируем при ошибке
      this.logger.error(`Error checking blocked status: ${error}`);
      return false;
    }
  }

  async resetEmailAttempts(email: string): Promise<void> {
    const emailKey = this.getEmailKey(email);

    try {
      await this.cache.del(emailKey);
      this.logger.log(`Reset attempts for email: ${email}`);
    } catch (error) {
      // Не критично, если не удалось сбросить
      this.logger.warn(`Error resetting email attempts: ${error}`);
    }
  }

  async getBlockInfo(
    email: string,
    ip: string,
  ): Promise<{
    emailAttempts: number;
    emailTtl: number;
    ipAttempts: number;
    ipTtl: number;
  }> {
    const emailKey = this.getEmailKey(email);
    const ipKey = this.getIpKey(ip);

    try {
      const [emailAttempts, emailTtl, ipAttempts, ipTtl] = await Promise.all([
        this.cache.safeGet<string>(emailKey),
        this.cache.safeTtl(emailKey),
        this.cache.safeGet<string>(ipKey),
        this.cache.safeTtl(ipKey),
      ]);

      return {
        emailAttempts: emailAttempts ? parseInt(emailAttempts, 10) : 0,
        emailTtl: emailTtl ?? 0,
        ipAttempts: ipAttempts ? parseInt(ipAttempts, 10) : 0,
        ipTtl: ipTtl ?? 0,
      };
    } catch (error) {
      this.logger.error(`Error getting block info: ${error}`);
      return {
        emailAttempts: 0,
        emailTtl: 0,
        ipAttempts: 0,
        ipTtl: 0,
      };
    }
  }
}
