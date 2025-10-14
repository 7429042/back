import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Category,
  CategoryDocument,
  ParentCategory,
  ParentCategoryDocument,
} from './schemas/category.schema';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import slugify from '@sindresorhus/slugify';
import { ConfigService } from '@nestjs/config';
import { rmSync } from 'node:fs';
import { SimpleRedisService } from '../redis/redis.service';

export interface CategorySearchResult {
  name: string;
  slug: string;
  path: string;
  imageUrl?: string;
  score?: number;
}

export type CategoryLean = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  path: string;
  imageUrl?: string;
  views: number;
};

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(ParentCategory.name)
    private readonly parentCategoryModel: Model<ParentCategoryDocument>,
    private readonly config: ConfigService,
    private readonly cache: SimpleRedisService,
  ) {
    const ttlIdsMs = Number(this.config.get('CATEGORIES_IDS_TTL_MS'));
    const ttlReadMs = Number(this.config.get('CATEGORIES_CACHE_TTL_MS'));
    this.IDS_TTL_MS =
      Number.isFinite(ttlIdsMs) && ttlIdsMs > 0 ? ttlIdsMs : 60_000;
    this.READ_TTL_MS =
      Number.isFinite(ttlReadMs) && ttlReadMs > 0 ? ttlReadMs : 120_000;

    this.IDS_TTL_S = Math.max(1, Math.floor(this.IDS_TTL_MS / 1000));
    this.READ_TTL_S = Math.max(1, Math.floor(this.READ_TTL_MS / 1000));
  }

  private readonly IDS_TTL_MS: number;
  private readonly READ_TTL_MS: number;
  private readonly IDS_TTL_S: number;
  private readonly READ_TTL_S: number;

  private static readonly BASE_PROJECTION = {
    name: 1,
    slug: 1,
    path: 1,
    imageUrl: 1,
    views: 1,
  } as const;

  private escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private normalizeSlug(input: string) {
    return slugify(input, { separator: '-', lowercase: true });
  }

  private async ensureUniqueSlug(slug: string) {
    let candidate = slug;
    let i = 2;
    while (await this.categoryModel.exists({ slug: candidate })) {
      candidate = `${slug}-${i++}`;
    }
    return candidate;
  }

  private buildCategoryImageUrl(slug: string, filename: string) {
    return `/uploads/categories/${slug}/${filename}`;
  }

  private resolveRootParentBySlug(parentSlug: string) {
    const normalized = this.normalizeSlug(parentSlug);
    return this.parentCategoryModel.findOne({ slug: normalized }).exec();
  }

  private isMongoDuplicateKey(err: unknown): err is { code: number } {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in (err as Record<string, unknown>) &&
      typeof (err as Record<string, unknown>).code === 'number' &&
      (err as { code: number }).code === 11000
    );
  }

  private cacheKeyAll() {
    return 'categories:all';
  }

  private cacheKeySearch(query: string, limit: number) {
    return `categories:search:${query.toLowerCase()}:${limit}`;
  }

  private cacheKeyIds(slug: string) {
    const normalized = this.normalizeSlug(slug);
    return `categories:ids:${normalized}`;
  }

  private async invalidateReadCache() {
    await this.cache.safeDel(this.cacheKeyAll());
  }

  private async invalidateIdsCache(slug: string) {
    await this.cache.safeDel(this.cacheKeyIds(slug));
  }

  private cacheKeyParentCounters() {
    return 'categories:parent-counters';
  }

  private async invalidateParentCountersCache() {
    await this.cache.safeDel(this.cacheKeyParentCounters());
  }

  async onModuleInit() {
    try {
      const roots = [
        'Профессиональное обучение',
        'Профессиональная переподготовка',
        'Повышение квалификации',
      ];

      for (const name of roots) {
        const slug = this.normalizeSlug(name);
        await this.parentCategoryModel.updateOne(
          { slug },
          { $setOnInsert: { name, slug } },
          { upsert: true },
        );
      }
    } catch (e) {
      console.warn('Error initializing categories:', e);
    }
  }

  async findAll(): Promise<CategoryLean[]> {
    const key = this.cacheKeyAll();
    const cached = await this.cache.safeGet<CategoryLean[]>(key);
    if (cached) return cached;

    const docs = await this.categoryModel
      .find({}, CategoriesService.BASE_PROJECTION)
      .sort({ path: 1 })
      .lean()
      .exec();

    const value = (docs ?? []) as CategoryLean[];
    await this.cache.safeSet(key, value, this.READ_TTL_S);
    return value;
  }

  async search(q: string, limit: number = 20): Promise<CategorySearchResult[]> {
    const query = q ? q.trim() : '';
    if (!query) return [];
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const key = this.cacheKeySearch(query, safeLimit);
    const cached = await this.cache.safeGet<CategorySearchResult[]>(key);
    if (cached) return cached;

    let res: CategorySearchResult[] = [];
    if (query.length >= 2) {
      const regex = new RegExp(this.escapeRegExp(query), 'i');
      const projection = {
        name: 1,
        slug: 1,
        path: 1,
        imageUrl: 1,
        score: { $meta: 'textScore' },
      } as const;
      const sortCriteria = {
        score: { $meta: 'textScore' },
        path: 1,
      } as const;

      const docs = await this.categoryModel
        .find(
          { $or: [{ $text: { $search: query } }, { slug: regex }] },
          projection,
        )
        .sort(sortCriteria as Record<string, 1 | -1 | { $meta: string }>)
        .limit(safeLimit)
        .lean()
        .exec();
      res = docs as CategorySearchResult[];
    } else {
      const regex = new RegExp(this.escapeRegExp(query), 'i');
      const docs = await this.categoryModel
        .find(
          { $or: [{ name: regex }, { slug: regex }] },
          { name: 1, slug: 1, path: 1, imageUrl: 1 },
        )
        .sort({ path: 1 })
        .limit(safeLimit)
        .lean()
        .exec();
      res = docs as CategorySearchResult[];
    }
    await this.cache.safeSet(key, res, this.READ_TTL_S);
    return res;
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const providedSlug = dto.slug?.trim();

    if (!dto.parentSlug) {
      throw new BadRequestException(
        'Parent slug is required: category must belong to one of the three parent categories',
      );
    }

    const parentRoot = await this.resolveRootParentBySlug(dto.parentSlug);
    if (!parentRoot) {
      throw new BadRequestException(
        `Parent with slug "${dto.parentSlug}" not found`,
      );
    }

    const rawSlugSource =
      providedSlug && providedSlug.length > 0 ? providedSlug : name;
    const normalized = this.normalizeSlug(rawSlugSource);
    const uniqueSlug = await this.ensureUniqueSlug(normalized);

    const path = `${parentRoot.slug}/${uniqueSlug}`;

    try {
      const created = await this.categoryModel.create({
        name,
        slug: uniqueSlug,
        parentModel: 'ParentCategory',
        path,
      });
      await this.invalidateReadCache();
      await this.invalidateParentCountersCache();
      return created;
    } catch (e: unknown) {
      if (this.isMongoDuplicateKey(e)) {
        throw new BadRequestException(
          `Category with slug "${uniqueSlug}" already exists`,
        );
      }
      throw e;
    }
  }

  async ensure(dto: CreateCategoryDto) {
    const normalized = this.normalizeSlug(dto.slug?.trim() ?? dto.name);
    const existing = await this.categoryModel
      .findOne({ slug: normalized })
      .lean<CategoryLean>()
      .exec();
    if (existing) return existing;
    return this.create({ ...dto, slug: normalized });
  }

  async findBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const cat = await this.categoryModel
      .findOne({ slug: normalized }, CategoriesService.BASE_PROJECTION)
      .lean<CategoryLean>()
      .exec();
    if (!cat) {
      throw new NotFoundException(
        `Category with slug "${normalized}" not found`,
      );
    }
    return cat;
  }

  async updateBySlug(
    slug: string,
    data: Partial<{ name: string; slug: string; parentSlug: string }>,
  ) {
    const normalized = this.normalizeSlug(slug);
    const current = await this.categoryModel
      .findOne({ slug: normalized })
      .exec();
    if (!current) {
      throw new NotFoundException(
        `Category with slug "${normalized}" not found`,
      );
    }

    const updates: Partial<
      Pick<Category, 'name' | 'slug' | 'path' | 'parentModel'>
    > = {};

    if (typeof data.name === 'string') {
      updates.name = data.name.trim();
    }

    let newSlug = current.slug;
    if (typeof data.slug === 'string' && data.slug.trim().length > 0) {
      const desiredSlug = this.normalizeSlug(data.slug);
      if (desiredSlug !== current.slug)
        newSlug = await this.ensureUniqueSlug(desiredSlug);
    }

    let basePath: string;
    if (Object.prototype.hasOwnProperty.call(data, 'parentSlug')) {
      if (data.parentSlug === null) {
        throw new BadRequestException('Parent slug is required');
      }
      const parentRoot = await this.resolveRootParentBySlug(
        String(data.parentSlug),
      );
      if (!parentRoot) {
        throw new BadRequestException(
          `Parent with slug "${data.parentSlug}" not found`,
        );
      }
      updates.parentModel = 'ParentCategory';
      basePath = parentRoot.slug;
    } else {
      const parts = String(current.path || '').split('/');
      basePath = parts[0] || '';
    }

    const newPath = basePath ? `${basePath}/${newSlug}` : newSlug;
    updates.slug = newSlug;
    updates.path = newPath;

    const prevPath = current.path;
    await this.categoryModel.updateOne({ _id: current._id }, updates).exec();

    if (prevPath !== newPath) {
      const safePrev = this.escapeRegExp(prevPath);
      const regex = new RegExp(`^${safePrev}(/|$)`);
      const descendants = await this.categoryModel.find({ path: regex }).exec();
      for (const doc of descendants) {
        if (doc._id.equals(current._id)) continue;
        const suffix = doc.path.substring(prevPath.length);
        const updatedPath = `${newPath}${suffix}`;
        await this.categoryModel
          .updateOne({ _id: doc._id }, { path: updatedPath })
          .exec();
      }
    }

    await this.invalidateReadCache();
    await this.invalidateIdsCache(slug);
    await this.invalidateIdsCache(newSlug);
    await this.invalidateParentCountersCache();
    return this.categoryModel.findById(current._id).lean().exec();
  }

  async deleteBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const current = await this.categoryModel
      .findOne({ slug: normalized }, { _id: 1, path: 1 })
      .lean<{ _id: Types.ObjectId; path: string }>()
      .exec();
    if (!current) {
      throw new NotFoundException(
        `Category with slug "${normalized}" not found`,
      );
    }

    const safePath = this.escapeRegExp(current.path);
    const regex = new RegExp(`^${safePath}(\\/|$)`);
    await this.categoryModel.deleteMany({ path: regex }).exec();

    await this.invalidateReadCache();
    await this.invalidateIdsCache(slug);
    await this.invalidateParentCountersCache();
    return { deleted: true };
  }

  async collectCategoryAndDescendantsIdsBySlug(
    slug: string,
  ): Promise<Types.ObjectId[]> {
    const key = this.cacheKeyIds(slug);
    const cached = await this.cache.safeGet<string[]>(key);
    if (cached) return cached.map((id) => new Types.ObjectId(id));

    const normalized = this.normalizeSlug(slug);
    const cat = await this.categoryModel.findOne({ slug: normalized }).exec();
    if (!cat) {
      throw new NotFoundException(`Category with slug "${slug}" not found`);
    }

    const safePath = this.escapeRegExp(cat.path);
    const regex = new RegExp(`^${safePath}(\\/|$)`);
    const all = (await this.categoryModel
      .find({ path: regex }, { _id: 1 })
      .lean()
      .exec()) as { _id: Types.ObjectId }[];
    const ids = (all ?? []).map((item) => new Types.ObjectId(item._id));

    await this.cache.safeSet(
      key,
      ids.map((x) => String(x)),
      this.IDS_TTL_S,
    );
    return ids;
  }

  async setImage(slug: string, filename: string) {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) throw new NotFoundException('Категория не найдена');

    const prev = cat.imageUrl;
    if (prev) {
      try {
        rmSync(`.${prev}`, { force: true });
      } catch {
        /* noop */
      }
    }

    cat.imageUrl = this.buildCategoryImageUrl(slug, filename);
    await cat.save();
    await this.invalidateReadCache();
    await this.invalidateParentCountersCache();
    return { imageUrl: cat.imageUrl };
  }

  async clearImage(slug: string) {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) throw new NotFoundException('Категория не найдена');

    if (cat.imageUrl) {
      try {
        rmSync(`.${cat.imageUrl}`, { force: true });
      } catch {
        /* noop */
      }
    }

    cat.imageUrl = undefined;
    await cat.save();
    await this.invalidateReadCache();
    await this.invalidateParentCountersCache();
    return { success: true };
  }

  async incrementViews(slug: string) {
    const updated = await this.categoryModel
      .findOneAndUpdate(
        { slug },
        { $inc: { views: 1 } },
        {
          new: true,
          projection: (this.constructor as typeof CategoriesService)
            .BASE_PROJECTION,
        },
      )
      .lean<CategoryLean>()
      .exec();
    if (!updated) throw new NotFoundException('Категория не найдена');
    await this.cache.safeDel('categories:all');
    return updated;
  }

  async getParentsCounters(): Promise<
    { slug: string; name: string; count: number }[]
  > {
    const key = this.cacheKeyParentCounters();
    const cached =
      await this.cache.safeGet<{ slug: string; name: string; count: number }[]>(
        key,
      );
    if (cached) return cached;

    const parents = await this.parentCategoryModel
      .find({}, { slug: 1, name: 1 })
      .lean()
      .exec();

    const buckets = await this.categoryModel.aggregate<{
      _id: string;
      count: number;
    }>([
      { $project: { root: { $arrayElemAt: [{ $split: ['$path', '/'] }, 0] } } },
      { $group: { _id: '$root', count: { $sum: 1 } } },
    ]);

    const counts = new Map(buckets.map((x) => [x._id, x.count]));
    const order = [
      'professionalnoe-obuchenie',
      'professionalnaya-perepodgotovka',
      'povyshenie-kvalifikacii',
    ];

    const nameBySlug = new Map(parents.map((x) => [x.slug, x.name]));

    const result = order.map((slug) => ({
      slug,
      name: nameBySlug.get(slug) ?? slug,
      count: counts.get(slug) ?? 0,
    }));

    await this.cache.safeSet(key, result, this.READ_TTL_S);
    return result;
  }
}
