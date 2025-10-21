import { Injectable } from '@nestjs/common';
import { Program } from '../schemas/programSchema';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';
import { ProgramsCacheService } from './programs.cache';
import { ProgramsRepository } from './programs.repository';
import { ProgramResponseDto } from '../dto/program-response.dto';
import { escapeRegExp } from './programs.utils';
import { AnyProgram, mapPrograms } from '../mappers/program.mapper';

@Injectable()
export class ProgramsSuggestService {
  private readonly SUGGEST_TTL_MS: number;
  private readonly SUGGEST_TTL_S: number;
  constructor(
    private readonly repo: ProgramsRepository,
    private readonly config: ConfigService,
    private readonly cache: SimpleRedisService,
    private readonly programsCache: ProgramsCacheService,
  ) {
    const suggestMs = Number(this.config.get('PROGRAMS_SUGGEST_TTL_MS'));
    this.SUGGEST_TTL_MS =
      Number.isFinite(suggestMs) && suggestMs > 0 ? suggestMs : 60_000;
    this.SUGGEST_TTL_S = Math.max(1, Math.floor(this.SUGGEST_TTL_MS / 1000));
  }

  async suggest(params: {
    q?: string;
    limit?: number;
    categoryIds?: Types.ObjectId[];
    status?: 'draft' | 'published';
  }): Promise<ProgramResponseDto[]> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

    const filter: Partial<Record<keyof Program, unknown>> & {
      status: 'draft' | 'published';
    } = {
      status: params.status ?? 'published',
    } as const as { status: 'draft' | 'published' } & Record<string, unknown>;

    if (params.categoryIds?.length) {
      (filter as Record<string, unknown>).category = {
        $in: params.categoryIds,
      };
    }
    if (!params.q || params.q.length < 1) return [];

    const safe = escapeRegExp(params.q.toLowerCase());
    (filter as Record<string, unknown>).lowercaseTitle = { $regex: `^${safe}` };

    const cats: string[] = params.categoryIds
      ? params.categoryIds.map(String)
      : [];
    const key = this.programsCache.keySuggest({
      q: safe,
      limit,
      status: filter.status,
      cats,
    });

    const cached = await this.cache.safeGet<ProgramResponseDto[]>(key);
    if (cached) return cached;
    const docs = await this.repo
      .find(filter)
      .sort({ views: -1, createdAt: -1 })
      .limit(limit)
      .select({
        title: 1,
        slug: 1,
        category: 1,
        hours: 1,
        price: 1,
        views: 1,
        createdAt: 1,
      })
      .lean<AnyProgram[]>()
      .exec();

    const result = mapPrograms(docs);
    await this.cache.safeSet(key, result, this.SUGGEST_TTL_S);
    return result;
  }
}
