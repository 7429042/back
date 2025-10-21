import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';
import { ProgramsCacheService } from './programs.cache';
import { FilterQuery, Types } from 'mongoose';
import { ProgramResponseDto } from '../dto/program-response.dto';
import { Program } from '../schemas/programSchema';
import { AnyProgram, mapProgram, mapPrograms } from '../mappers/program.mapper';

class ProgramsRepository {}

@Injectable()
export class ProgramsReadService {
  private readonly READ_TTL_MS: number;
  private readonly READ_TTL_S: number;

  constructor(
    private readonly repo: ProgramsRepository,
    private readonly config: ConfigService,
    private readonly cache: SimpleRedisService,
    private readonly programsCache: ProgramsCacheService,
  ) {
    const readMs = Number(this.config.get('PROGRAMS_CACHE_TTL_MS'));
    this.READ_TTL_MS = Number.isFinite(readMs) && readMs > 0 ? readMs : 120_000;
    this.READ_TTL_S = Math.max(1, Math.floor(this.READ_TTL_MS / 1000));
  }

  async findAll(params: {
    status?: 'draft' | 'published';
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
    sort?: 'createdAt' | 'views' | 'hours';
    order?: 'asc' | 'desc';
    text?: string;
  }): Promise<ProgramResponseDto[]> {
    const key = this.programsCache.keyList({
      status: params.status,
      limit: params.limit,
      offset: params.offset,
      categoryIds: (params.categoryIds ?? []).map(String),
      sort: params.sort,
      order: params.order,
      text: params.text,
    });
    const cached = await this.cache.safeGet<ProgramResponseDto[]>(key);
    if (cached) return cached;

    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds?.length)
      filter.category = { $in: params.categoryIds };

    let useTextScore = false;
    if (params.text) {
      const words = params.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      if (words.length) {
        const search = words.map((w) => `"${w}"`).join(' ');
        (filter as any).$text = {
          $search: search,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
        useTextScore = true;
      }
    }
    const primary = params.sort ?? 'createdAt';
    const dir = params.order === 'asc' ? 1 : -1;

    const query = useTextScore
      ? this.repo.find(filter, {
          score: { $meta: 'textScore' } as unknown as 1,
        })
      : this.repo.find(filter);

    if (useTextScore) {
      (query as any).sort({ score: { $meta: 'textScore' } as unknown as 1 });
    }

    const sortSpec: Record<string, 1 | -1> = { [primary]: dir };
    if (primary !== 'createdAt') sortSpec.createdAt = -1;
    query.sort(sortSpec);

    if (params.limit) query.limit(params.limit);
    if (params.offset) query.skip(params.offset);

    const rows = await query.lean<AnyProgram[]>().exec();
    const result = mapPrograms(rows);
    await this.cache.safeSet(key, result, this.READ_TTL_S);
    return result;
  }

  async findAllWithMeta(params: {
    status?: 'draft' | 'published';
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
    text?: string;
    sort?: 'createdAt' | 'views' | 'hours';
    order?: 'asc' | 'desc';
  }): Promise<{
    items: ProgramResponseDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const key = this.programsCache.keyList({
      status: params.status,
      limit: params.limit,
      offset: params.offset,
      categoryIds: (params.categoryIds ?? []).map(String),
      sort: params.sort,
      order: params.order,
      text: params.text,
    });
    const cached = await this.cache.safeGet<{
      items: ProgramResponseDto[];
      total: number;
      limit: number;
      offset: number;
    }>(key);
    if (cached) return cached;

    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds?.length)
      filter.category = { $in: params.categoryIds };

    let useTextScore = false;
    if (params.text) {
      const words = params.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      if (words.length) {
        const search = words.map((w) => `"${w}"`).join(' ');
        (filter as any).$text = {
          $search: search,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
        useTextScore = true;
      }
    }
    const MAX_LIMIT = 100;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), MAX_LIMIT);
    const offset = Math.max(params.offset ?? 0, 0);

    const primary = params.sort ?? 'createdAt';
    const dir = params.order === 'asc' ? 1 : -1;

    const baseQuery = useTextScore
      ? this.repo.find(filter, {
          score: { $meta: 'textScore' } as unknown as 1,
        })
      : this.repo.find(filter);

    if (useTextScore) {
      (baseQuery as any).sort({
        score: { $meta: 'textScore' } as unknown as 1,
      });
    }

    const sortSpec: Record<string, 1 | -1> = { [primary]: dir };
    if (primary !== 'createdAt') sortSpec.createdAt = -1;
    baseQuery.sort(sortSpec);
    const [itemsRaw, total] = await Promise.all([
      (baseQuery as any).skip(offset).limit(limit).lean<AnyProgram[]>().exec(),
      this.repo.count(filter),
    ]);

    const result = { items: mapPrograms(itemsRaw), total, limit, offset };
    await this.cache.safeSet(key, result, this.READ_TTL_S);
    return result;
  }

  async findOneById(
    id: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Program not found');

    const current = await this.repo.findByIdLean(id) as AnyProgram | null;
    if (!current) throw new NotFoundException('Program not found');

    if (incrementView && current.status === 'published') {
      const updated = await this.repo
        .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
        .lean<AnyProgram>()
        .exec();

      await this.programsCache.invalidateLists();
      return mapProgram(updated ?? current);
    }
    return mapProgram(current);
  }

  async findOneBySlug(
    slug: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;
    const normalized = normalizeSlug(slug);

    const current = (await this.repo.findOneLean({ slug: normalized })) as AnyProgram | null;
    if (!current) throw new NotFoundException('Program not found');

    if (incrementView && current.status === 'published') {
      const updated = await this.repo
        .findOneAndUpdate({ slug: normalized }, { $inc: { views: 1 } }, { new: true })
        .lean<AnyProgram>()
        .exec();

      await this.programsCache.invalidateLists();
      return mapProgram(updated ?? current);
    }
    return mapProgram(current);
  }
}
