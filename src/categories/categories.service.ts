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
  ) {
    const ttl = Number(this.config.get('CATEGORIES_IDS_TTL_MS'));
    this.IDS_TTL_MS = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
    const readTtl = Number(this.config.get('CATEGORIES_CACHE_TTL_MS'));
    this.READ_TTL_MS =
      Number.isFinite(readTtl) && readTtl > 0 ? readTtl : 120_000;
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

  private readonly idsCache = new Map<
    string,
    { expires: number; ids: Types.ObjectId[] }
  >();
  private readonly IDS_TTL_MS: number;

  private readonly readCache = new Map<
    string,
    { expires: number; value: unknown }
  >();
  private readonly READ_TTL_MS: number;

  // Общие проекции
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

  private createCacheKeyForIds(slug: string) {
    return `ids:${this.normalizeSlug(slug)}`;
  }

  private clearIdsCache() {
    this.idsCache.clear();
  }

  private clearReadCache() {
    this.readCache.clear();
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

  async findAll(): Promise<CategoryLean[]> {
    const key = 'read:all';
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expires > now) return cached.value as CategoryLean[];

    const res = await this.categoryModel
      .find({}, CategoriesService.BASE_PROJECTION)
      .sort({ path: 1 })
      .lean()
      .exec();

    const value = (res ?? []) as CategoryLean[];
    this.readCache.set(key, { expires: now + this.READ_TTL_MS, value });
    return value;
  }

  async search(q: string, limit: number = 20): Promise<CategorySearchResult[]> {
    const query = q ? q.trim() : '';
    if (!query) return [];
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const key = `read:search:${query.toLowerCase()}:${safeLimit}`;
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expires > now)
      return cached.value as CategorySearchResult[];

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

    this.readCache.set(key, { expires: now + this.READ_TTL_MS, value: res });
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
      this.clearIdsCache();
      this.clearReadCache();
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

    this.clearIdsCache();
    this.clearReadCache();
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

    this.clearIdsCache();
    this.clearReadCache();
    return { deleted: true };
  }

  async collectCategoryAndDescendantsIdsBySlug(
    slug: string,
  ): Promise<Types.ObjectId[]> {
    const key = this.createCacheKeyForIds(slug);
    const now = Date.now();
    const cached = this.idsCache.get(key);
    if (cached && cached.expires > now) {
      return cached.ids;
    } else if (cached) {
      this.idsCache.delete(key);
    }

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

    this.idsCache.set(key, { expires: now + this.IDS_TTL_MS, ids });
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
    return { success: true };
  }

  async incrementViews(slug: string) {
    const updated = await this.categoryModel
      .findOneAndUpdate(
        { slug },
        { $inc: { views: 1 } },
        { new: true, projection: CategoriesService.BASE_PROJECTION },
      )
      .lean<CategoryLean>()
      .exec();
    if (!updated) throw new NotFoundException('Категория не найдена');
    return updated;
  }
}
