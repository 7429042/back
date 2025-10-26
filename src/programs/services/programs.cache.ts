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
    try {
      const deleted = await this.cache.safeDelByPattern('programs:list:*');
      if (deleted > 0) {
        this.logger.log(`Invalidated ${deleted} list cache entries`);
      }
    } catch (error) {
      this.logger.warn(`Failed to invalidate list cache: ${error}`);
    }
  }

  async invalidateSuggest() {
    try {
      const deleted = await this.cache.safeDelByPattern('programs:suggest:*');
      if (deleted > 0) {
        this.logger.log(`Invalidated ${deleted} suggest cache entries`);
      }
    } catch (error) {
      this.logger.warn(`Failed to invalidate suggest cache: ${error}`);
    }
  }
}
