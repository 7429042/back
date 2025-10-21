import { Injectable, Logger } from '@nestjs/common';
import { SimpleRedisService } from '../../redis/redis.service';

@Injectable()
export class ProgramsCacheService {
  private readonly logger = new Logger(ProgramsCacheService.name);

  constructor(private readonly cache: SimpleRedisService) {}

  keySuggest(params: {
    q: string;
    limit: number;
    status: 'draft' | 'published';
    cats: string[];
  }) {
    return `programs:suggest:${params.status}:${params.limit}:${params.q}:${params.cats.join(',')}`;
  }

  keyList(params: {
    status?: 'draft' | 'published';
    limit?: number;
    offset?: number;
    categoryIds?: string[];
    sort?: 'createdAt' | 'views' | 'hours';
    order?: 'asc' | 'desc';
    text?: string;
  }) {
    const parts = [
      `st:${params.status ?? ''}`,
      `l:${params.limit ?? ''}`,
      `o:${params.offset ?? ''}`,
      `c:${(params.categoryIds ?? []).join(',')}`,
      `s:${params.sort ?? ''}`,
      `d:${params.order ?? ''}`,
      `t:${(params.text ?? '').trim().toLowerCase()}`,
    ];
    return `programs:list:${parts.join('|')}`;
  }

  async invalidateLists() {
    // Идеально — удалить по паттерну. Если в SimpleRedisService нет delByPattern —
    // можно временно полагаться на TTL. Оставим попытку с паттерном и отлов ошибок.
    const anyCache = this.cache as any;
    if (typeof anyCache.delByPattern === 'function') {
      try {
        await anyCache.delByPattern('programs:list:*');
        return;
      } catch (e) {
        this.logger.warn(`delByPattern failed: ${e}`);
      }
    }
    // Фолбэк — ничего не делаем, кэш истечёт по TTL
  }

  async invalidateSuggest() {
    const anyCache = this.cache as any;
    if (typeof anyCache.delByPattern === 'function') {
      try {
        await anyCache.delByPattern('programs:suggest:*');
        return;
      } catch (e) {
        this.logger.warn(`delByPattern failed: ${e}`);
      }
    }
  }
}
