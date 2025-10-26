import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SimpleRedisService } from '../../redis/redis.service';
import { ProgramsCacheService } from './programs.cache';
import { FilterQuery, Query, Types } from 'mongoose';
import { ProgramResponseDto } from '../dto/program-response.dto';
import { Program, ProgramDocument } from '../schemas/programSchema';
import { AnyProgram, mapProgram, mapPrograms } from '../mappers/program.mapper';
import { ProgramsRepository } from './programs.repository';
import { normalizeSlug } from './programs.utils';

interface MongoTextSearch {
  $text: {
    $search: string;
    $caseSensitive: boolean;
    $diacriticSensitive: boolean;
  };
}

interface TextScoreSort {
  [key: string]: { $meta: 'textScore' } | 1 | -1;
  score: { $meta: 'textScore' };
}

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

  private buildBaseFilter(params: {
    status?: 'draft' | 'published';
    categoryIds?: Types.ObjectId[];
    text?: string;
  }): { filter: FilterQuery<Program>; useTextScore: boolean } {
    const filter: FilterQuery<Program> = {};

    if (params.status) {
      filter.status = params.status;
    }

    if (params.categoryIds?.length) {
      filter.category = { $in: params.categoryIds };
    }

    let useTextScore = false;
    if (params.text) {
      const words = params.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      if (words.length) {
        const search = words.map((w) => `"${w}"`).join(' ');
        const textSearch: MongoTextSearch = {
          $text: {
            $search: search,
            $caseSensitive: false,
            $diacriticSensitive: false,
          },
        };
        Object.assign(filter, textSearch);
        useTextScore = true;
      }
    }
    return { filter, useTextScore };
  }

  private applySort(
    query: Query<ProgramDocument[], ProgramDocument>,
    useTextScore: boolean,
    sort?: 'createdAt' | 'views' | 'hours',
    order?: 'asc' | 'desc',
  ): Query<ProgramDocument[], ProgramDocument> {
    if (useTextScore) {
      const textScoreSort: TextScoreSort = { score: { $meta: 'textScore' } };
      query.sort(textScoreSort);
    }

    const primary = sort ?? 'createdAt';
    const dir = order === 'asc' ? 1 : -1;
    const sortSpec: Record<string, 1 | -1> = { [primary]: dir };
    if (primary !== 'createdAt') sortSpec.createdAt = -1;
    query.sort(sortSpec);
    return query;
  }

  private createQuery(
    filter: FilterQuery<Program>,
    useTextScore: boolean,
  ): Query<ProgramDocument[], ProgramDocument> {
    if (useTextScore) {
      const projection: TextScoreSort = { score: { $meta: 'textScore' } };
      return this.repo.find(filter, projection);
    }
    return this.repo.find(filter);
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

    const { filter, useTextScore } = this.buildBaseFilter({
      status: params.status,
      categoryIds: params.categoryIds,
      text: params.text,
    });
    const query = this.createQuery(filter, useTextScore);
    this.applySort(query, useTextScore, params.sort, params.order);
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

    const MAX_LIMIT = 100;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), MAX_LIMIT);
    const offset = Math.max(params.offset ?? 0, 0);
    const { filter, useTextScore } = this.buildBaseFilter({
      status: params.status,
      categoryIds: params.categoryIds,
      text: params.text,
    });

    // Создание и настройка запроса
    const query = this.createQuery(filter, useTextScore);
    this.applySort(query, useTextScore, params.sort, params.order);
    query.skip(offset).limit(limit);

    // Параллельное выполнение запросов
    const [itemsRaw, total] = await Promise.all([
      query.lean<AnyProgram[]>().exec(),
      this.repo.count(filter),
    ]);
    const result = {
      items: mapPrograms(itemsRaw),
      total,
      limit,
      offset,
    };

    // Сохранение в кэш
    await this.cache.safeSet(key, result, this.READ_TTL_S);
    return result;
  }

  private async findAndIncrementViews(
    findFn: () => Promise<AnyProgram | null>,
    updateFn: () => Promise<AnyProgram | null>,
    incrementView: boolean,
  ): Promise<ProgramResponseDto> {
    const current = await findFn();
    if (!current) throw new NotFoundException('Программа не найдена');

    if (incrementView && current.status === 'published') {
      const updated = await updateFn();
      await this.programsCache.invalidateLists();
      return mapProgram(updated ?? current);
    }

    return mapProgram(current);
  }

  async findOneById(
    id: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Программа не найдена');

    return this.findAndIncrementViews(
      () => this.repo.findByIdLean(id) as Promise<AnyProgram | null>,
      async () => {
        return await this.repo
          .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
          .lean<AnyProgram>()
          .exec();
      },
      incrementView,
    );
  }

  async findOneBySlug(
    slug: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;
    const normalized = normalizeSlug(slug);
    return this.findAndIncrementViews(
      () =>
        this.repo.findOneLean({
          slug: normalized,
        }) as Promise<AnyProgram | null>,
      async () => {
        return await this.repo
          .findOneAndUpdate(
            { slug: normalized },
            { $inc: { views: 1 } },
            { new: true },
          )
          .lean<AnyProgram>()
          .exec();
      },
      incrementView,
    );
  }
}
