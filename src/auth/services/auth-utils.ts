import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthUtilsService {
  constructor(private readonly configService: ConfigService) {}
  getNumber(key: string, fallback: number): number {
    const raw = this.configService.get<string | number | undefined>(key);
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  }

  getBoolean(key: string, fallback: boolean): boolean {
    const raw = this.configService.get<string | boolean | undefined>(key);
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'string') {
      const parsed = raw.trim().toLowerCase();
      if (
        parsed === 'true' ||
        parsed === '1' ||
        parsed === 'yes' ||
        parsed === 'on'
      )
        return true;
      if (
        parsed === 'false' ||
        parsed === '0' ||
        parsed === 'no' ||
        parsed === 'off'
      )
        return false;
    }
    return fallback;
  }

  getBcryptRounds(): number {
    return this.getNumber('BCRYPT_ROUNDS', 10);
  }
}
