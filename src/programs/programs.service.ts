import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Program, ProgramDocument } from './schemas/programSchema';
import slugify from '@sindresorhus/slugify';
import { ProgramResponseDto } from './dto/program-response.dto';
import { AnyProgram, mapProgram, mapPrograms } from './mappers/program.mapper';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  // Простой кэш для suggest (ключ -> данные с TTL)
  private readonly suggestCache = new Map<
    string,
    { expires: number; data: ProgramResponseDto[] }
  >();
  private readonly SUGGEST_TTL_MS = 60_000;

  private clearSuggestCache() {
    this.suggestCache.clear();
  }

  private normalizeSlug(input: string) {
    return slugify(input, { separator: '-', lowercase: true });
  }

  private async ensureUniqueSlug(slug: string, executedId: Types.ObjectId) {
    let candidate = slug;
    let i = 2;
    while (
      await this.programModel.exists(
        executedId
          ? { slug: candidate, _id: { $ne: executedId } }
          : { slug: candidate },
      )
    ) {
      candidate = `${slug}-${i++}`;
    }
    return candidate;
  }

  private escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async createDraft(): Promise<{ id: string }> {
    const doc = await this.programModel.create({ status: 'draft' });
    return { id: doc._id.toString() };
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
    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds && params.categoryIds.length > 0) {
      filter.category = { $in: params.categoryIds };
    }

    let useTextScore = false;
    if (params.text) {
      const words = params.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      if (words.length > 0) {
        // AND-логика через кавычки вокруг каждого слова
        const search = words.map((w) => `"${w}"`).join(' ');
        filter.$text = {
          $search: search,
          $caseSensitive: false,
          $diacriticSensitive: false,
        };
        useTextScore = true;
      }
    }

    const primary = params.sort ?? 'createdAt';
    const dir = params.order === 'asc' ? 1 : -1;

    // Формируем запрос: с проекцией textScore или без неё
    const query = useTextScore
      ? this.programModel.find(filter, {
          score: { $meta: 'textScore' } as unknown as 1,
        })
      : this.programModel.find(filter);

    // Сортировка: сперва по релевантности (если есть), затем по выбранному полю и createdAt
    if (useTextScore) {
      query.sort({ score: { $meta: 'textScore' } as unknown as 1 });
    }
    const sortSpec: Record<string, 1 | -1> = { [primary]: dir };
    if (primary !== 'createdAt') sortSpec.createdAt = -1;
    query.sort(sortSpec);

    if (params.limit) query.limit(params.limit);
    if (params.offset) query.skip(params.offset);

    const rows = await query.lean<AnyProgram[]>().exec();
    return mapPrograms(rows);
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
    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds && params.categoryIds.length > 0)
      filter.category = { $in: params.categoryIds };

    let useTextScore = false;
    if (params.text) {
      const words = params.text
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2);
      if (words.length > 0) {
        const search = words.map((w) => `"${w}"`).join(' ');
        filter.$text = {
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
      ? this.programModel.find(filter, {
          score: { $meta: 'textScore' } as unknown as 1,
        })
      : this.programModel.find(filter);

    if (useTextScore) {
      baseQuery.sort({ score: { $meta: 'textScore' } as unknown as 1 });
    }
    const sortSpec: Record<string, 1 | -1> = { [primary]: dir };
    if (primary !== 'createdAt') sortSpec.createdAt = -1;
    baseQuery.sort(sortSpec);

    const [itemsRaw, total] = await Promise.all([
      baseQuery.skip(offset).limit(limit).lean<AnyProgram[]>().exec(),
      this.programModel.countDocuments(filter).exec(),
    ]);

    return {
      items: mapPrograms(itemsRaw),
      total,
      limit,
      offset,
    };
  }

  async findOneById(
    id: string,
    options?: {
      incrementView?: boolean;
    },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = incrementView
      ? await this.programModel
          .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
          .lean<AnyProgram>()
          .exec()
      : await this.programModel.findById(id).lean<AnyProgram>().exec();

    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    return mapProgram(doc);
  }

  async findOneBySlug(
    slug: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    const incrementView = options?.incrementView ?? true;
    const normalized = this.normalizeSlug(slug);

    const doc = incrementView
      ? await this.programModel
          .findOneAndUpdate(
            { slug: normalized },
            { $inc: { views: 1 } },
            { new: true },
          )
          .lean<AnyProgram>()
          .exec()
      : await this.programModel
          .findOne({ slug: normalized })
          .lean<AnyProgram>()
          .exec();

    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    return mapProgram(doc);
  }

  async publish(id: string): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = await this.programModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    if (doc.status === 'published') {
      throw new BadRequestException('Program is already published');
    }

    const errors: string[] = [];

    // Проверки title и дубля среди опубликованных
    if (!doc.title || !doc.title.trim()) {
      errors.push('Title is required');
    } else {
      const titleTrim = doc.title.trim();
      if (titleTrim.length < 3) {
        errors.push('Title must be at least 3 characters');
      }
      const baseSlug = this.normalizeSlug(titleTrim);
      const duplicate = await this.programModel.exists({
        slug: baseSlug,
        status: 'published',
        _id: { $ne: doc._id },
      });
      if (duplicate) {
        errors.push('Program with the same title is already published');
      }
    }

    // Прочие обязательные поля
    if (!doc.category) {
      errors.push('Category is required');
    }
    if (typeof doc.hours !== 'number' || doc.hours <= 0) {
      errors.push('Hours must be a positive number');
    }
    if (!doc.categoryType) {
      errors.push('Category type is required');
    }
    if (doc.categoryType === 'dpo' && !doc.dpoSubcategory) {
      errors.push('DPO subcategory is required');
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        `Cannot publish program: ${errors.join(', ')}`,
      );
    }

    // Именуем slug и гарантируем глобальную уникальность
    const base = this.normalizeSlug(doc.title!.trim());
    doc.slug = await this.ensureUniqueSlug(base, doc._id);

    doc.status = 'published';
    await doc.save();

    // Инвалидация кэша подсказок
    this.clearSuggestCache();

    // Возвращаем lean-версию
    const view = await this.programModel
      .findById(doc._id)
      .lean<AnyProgram>()
      .exec();
    if (!view) {
      throw new NotFoundException('Program not found');
    }
    return mapProgram(view);
  }

  async updateDraft(
    id: string,
    updates: Partial<
      Pick<
        Program,
        | 'title'
        | 'description'
        | 'hours'
        | 'categoryType'
        | 'dpoSubcategory'
        | 'category'
      >
    >,
  ): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = await this.programModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    if (doc.status !== 'draft') {
      throw new BadRequestException('Program is not in draft status');
    }

    if (typeof updates.title !== 'undefined') {
      doc.title = updates.title;
      if (updates.title && updates.title.trim()) {
        const base = this.normalizeSlug(updates.title);
        doc.slug = await this.ensureUniqueSlug(base, doc._id);
      } else {
        doc.slug = undefined;
      }
    }
    if (typeof updates.description !== 'undefined') {
      doc.description = updates.description;
    }
    if (typeof updates.hours !== 'undefined') {
      doc.hours = updates.hours;
    }
    if (typeof updates.categoryType !== 'undefined') {
      doc.categoryType = updates.categoryType;
    }
    if (typeof updates.dpoSubcategory !== 'undefined') {
      doc.dpoSubcategory = updates.dpoSubcategory;
    }
    if (typeof updates.category !== 'undefined') {
      doc.category = updates.category;
    }
    await doc.save();

    this.clearSuggestCache();

    // Возвращаем lean, чтобы не тащить Mongoose Document
    const view = await this.programModel
      .findById(doc._id)
      .lean<AnyProgram>()
      .exec();
    if (!view) {
      throw new NotFoundException('Program not found');
    }
    return mapProgram(view);
  }

  async deleteDraft(id: string): Promise<{ deleted: true }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }
    const doc = await this.programModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    if (doc.status !== 'draft') {
      throw new BadRequestException('Program is not in draft status');
    }
    await this.programModel.findByIdAndDelete(doc._id).exec();
    this.clearSuggestCache();
    return { deleted: true };
  }

  // Новое: быстрые подсказки по префиксу названия
  async suggest(params: {
    q?: string;
    limit?: number;
    categoryIds?: Types.ObjectId[];
    status?: 'draft' | 'published';
  }): Promise<ProgramResponseDto[]> {
    const limit = Math.min(Math.max(params.limit ?? 10, 1), 20);

    const filter: FilterQuery<Program> = {};
    // По умолчанию показываем только опубликованные
    const status: 'draft' | 'published' = params.status ?? 'published';
    filter.status = status;

    if (params.categoryIds && params.categoryIds.length > 0) {
      filter.category = { $in: params.categoryIds };
    }

    if (!params.q || params.q.length < 1) {
      return [];
    }

    const safe = this.escapeRegExp(params.q);
    const cats: string[] = params.categoryIds
      ? params.categoryIds.map((id) => String(id))
      : [];

    // Ключ кэша: учитываем строку, лимит, статус и категории
    const cacheKey = JSON.stringify({
      q: safe,
      limit,
      status,
      cats,
    });

    const cached = this.suggestCache.get(cacheKey);
    const now = Date.now();
    if (cached && cached.expires > now) {
      return cached.data;
    } else if (cached) {
      this.suggestCache.delete(cacheKey);
    }

    // Ищем по началу lowercaseTitle — индекс будет задействован
    filter.lowercaseTitle = { $regex: `^${safe}` };

    // Сначала популярные, потом самые новые
    const cursor = this.programModel
      .find(filter)
      .sort({ views: -1, createdAt: -1 })
      .limit(limit);

    cursor.select({
      title: 1,
      slug: 1,
      hours: 1,
      views: 1,
      category: 1,
      categoryType: 1,
      dpoSubcategory: 1,
      createdAt: 1,
    });

    const items = await cursor.lean<AnyProgram[]>().exec();
    const result = mapPrograms(items);

    // Сохраняем в кэш
    this.suggestCache.set(cacheKey, {
      expires: now + this.SUGGEST_TTL_MS,
      data: result,
    });

    return result;
  }
}
