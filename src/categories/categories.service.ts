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
  depth: number;
  score?: number;
}

// Lean representation of Category documents returned by Mongoose .lean()
export type CategoryLean = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  parent?: Types.ObjectId;
  path: string;
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

  private async resolveParentBySlug(
    parentSlug: string,
  ): Promise<
    | { model: 'ParentCategory'; doc: ParentCategoryDocument }
    | { model: 'Category'; doc: CategoryDocument }
    | null
  > {
    const normalized = this.normalizeSlug(parentSlug);
    const pRoot = await this.parentCategoryModel
      .findOne({ slug: normalized })
      .exec();
    if (pRoot) return { model: 'ParentCategory', doc: pRoot };
    const pCat = await this.categoryModel.findOne({ slug: normalized }).exec();
    if (pCat) return { model: 'Category', doc: pCat };
    return null;
  }

  async onModuleInit() {
    try {
      const root1Name = 'Профессиональное обучение';
      const root2Name = 'Дополнительное профессиональное образование';
      const root1Slug = this.normalizeSlug(root1Name);
      const root2Slug = this.normalizeSlug(root2Name);

      // Идемпотентно создать корни в ParentCategory
      await this.parentCategoryModel.updateOne(
        { slug: root1Slug },
        { $setOnInsert: { name: root1Name, slug: root1Slug, depth: 0 } },
        { upsert: true },
      );
      await this.parentCategoryModel.updateOne(
        { slug: root2Slug },
        { $setOnInsert: { name: root2Name, slug: root2Slug, depth: 0 } },
        { upsert: true },
      );
      const child1Name = 'Повышение квалификации';
      const child2Name = 'Профессиональная переподготовка';
      const pRoot2 = await this.parentCategoryModel
        .findOne({ slug: root2Slug })
        .exec();
      if (pRoot2) {
        for (const name of [child1Name, child2Name]) {
          const slug = this.normalizeSlug(name);
          const exists = await this.categoryModel.exists({ slug });
          if (!exists) {
            const path = `${pRoot2.slug}/${slug}`;
            await this.categoryModel.create({
              name,
              slug,
              parentModel: 'ParentCategory',
              parent: pRoot2._id,
              path,
              depth: Math.max(0, path.split('/').length - 1),
            });
          }
        }
      }
    } catch (e) {
      console.warn('Category seeding failed:', e);
    }
  }

  private readonly idsCache = new Map<
    string,
    { expires: number; ids: Types.ObjectId[] }
  >();
  private IDS_TTL_MS: number;

  private readonly readCache = new Map<
    string,
    { expires: number; value: unknown }
  >();
  private READ_TTL_MS: number;

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

  createCacheKeyForIds(slug: string) {
    return `ids:${this.normalizeSlug(slug)}`;
  }

  clearIdsCache() {
    this.idsCache.clear();
  }

  clearReadCache() {
    this.readCache.clear();
  }

  private buildCategoryImageUrl(slug: string, filename: string) {
    return `/uploads/categories/${slug}/${filename}`;
  }

  async findAll(): Promise<CategoryLean[]> {
    const key = 'read:all';
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expires > now) return cached.value as CategoryLean[];
    const res = await this.categoryModel.find().sort({ path: 1 }).lean().exec();
    const resTyped = (res ?? []) as CategoryLean[];
    this.readCache.set(key, {
      expires: now + this.READ_TTL_MS,
      value: resTyped,
    });
    return resTyped;
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
        depth: 1,
        score: { $meta: 'textScore' },
      };
      const sortCriteria = {
        score: { $meta: 'textScore' },
        path: 1,
      } as const;
      const docs = (await this.categoryModel
        .find(
          { $or: [{ $text: { $search: query } }, { slug: regex }] },
          projection,
        )
        .sort(sortCriteria as Record<string, 1 | -1 | { $meta: string }>)
        .limit(safeLimit)
        .lean()
        .exec()) as CategorySearchResult[];
      res = docs;
    } else {
      const regex = new RegExp(this.escapeRegExp(query), 'i');
      const docs = (await this.categoryModel
        .find(
          { $or: [{ name: regex }, { slug: regex }] },
          { name: 1, slug: 1, path: 1, depth: 1 },
        )
        .sort({ path: 1 })
        .limit(safeLimit)
        .lean()
        .exec()) as CategorySearchResult[];
      res = docs;
    }

    this.readCache.set(key, { expires: now + this.READ_TTL_MS, value: res });
    return res;
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const providedSlug = dto.slug?.trim();

    let parentModel: 'ParentCategory' | 'Category' | undefined;
    let parentDoc: ParentCategoryDocument | CategoryDocument | null = null;

    if (dto.parentSlug) {
      const resolved = await this.resolveParentBySlug(dto.parentSlug);
      if (!resolved) {
        throw new BadRequestException(
          `Parent with slug "${dto.parentSlug}" not found`,
        );
      }
      parentModel = resolved.model;
      parentDoc = resolved.doc;
    }
    const rawSlugSource =
      providedSlug && providedSlug.length > 0 ? providedSlug : name;
    const normalized = this.normalizeSlug(rawSlugSource);
    const uniqueSlug = await this.ensureUniqueSlug(normalized);

    const basePath = parentDoc
      ? parentModel === 'ParentCategory'
        ? (parentDoc as ParentCategoryDocument).slug
        : (parentDoc as CategoryDocument).path
      : '';
    const path = basePath ? `${basePath}/${uniqueSlug}` : uniqueSlug;

    // Type guard to safely detect Mongo duplicate key errors
    const hasMongoCode = (err: unknown): err is { code: number } =>
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as Record<string, unknown>).code === 'number';

    try {
      const created = await this.categoryModel.create({
        name,
        slug: uniqueSlug,
        parentModel,
        parent: parentDoc?._id,
        path,
        depth: Math.max(0, path.split('/').length - 1),
      });
      this.clearIdsCache();
      this.clearReadCache();
      return created;
    } catch (e: unknown) {
      if (hasMongoCode(e) && e.code === 11000) {
        throw new BadRequestException(
          `Category with slug "${uniqueSlug}" already exists`,
        );
      }
      throw e;
    }
  }

  async ensure(dto: CreateCategoryDto) {
    const providedSlug = dto.slug?.trim() ?? this.normalizeSlug(dto.name);
    const normalized = this.normalizeSlug(providedSlug);
    const existing = await this.categoryModel
      .findOne({ slug: normalized })
      .lean<CategoryLean>()
      .exec();
    if (existing) return existing;
    // If not exists, try to create
    return this.create({ ...dto, slug: normalized });
  }

  async findBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const cat = await this.categoryModel
      .findOne({ slug: normalized })
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
      Pick<Category, 'name' | 'slug' | 'path' | 'parent' | 'parentModel'>
    > = {};

    if (typeof data.name === 'string') {
      updates.name = data.name.trim();
    }
    let newParentDoc: ParentCategoryDocument | CategoryDocument | null = null;
    let newParentModel: 'ParentCategory' | 'Category' | undefined;
    let parentChanged = false;

    if (typeof data.parentSlug === 'string') {
      const resolved = await this.resolveParentBySlug(data.parentSlug);
      if (!resolved) {
        throw new BadRequestException(
          `Parent with slug "${data.parentSlug}" not found`,
        );
      }
      newParentDoc = resolved.doc;
      newParentModel = resolved.model;

      if (newParentModel === 'Category') {
        const parentCat = newParentDoc as CategoryDocument;
        if (parentCat._id.equals(current._id)) {
          throw new BadRequestException('Category cannot be its own parent');
        }
        const currentPath = current.path;
        if (
          parentCat.path === currentPath ||
          parentCat.path.startsWith(currentPath + '/')
        ) {
          throw new BadRequestException(
            'Cannot assign a descendant as a parent',
          );
        }
      }
      if (
        !current.parent ||
        !current.parentModel ||
        current.parent.toString() !== newParentDoc._id.toString() ||
        current.parentModel !== newParentModel
      ) {
        parentChanged = true;
        updates.parent = newParentDoc._id;
        updates.parentModel = newParentModel;
      }
    } else if (data.parentSlug === null) {
      // Сделать корневой относительно дерева ParentCategory/Category
      updates.parent = undefined;
      updates.parentModel = undefined;
      parentChanged = true;
    }

    let newSlug = current.slug;
    if (typeof data.slug === 'string' && data.slug.trim().length > 0) {
      const desired = this.normalizeSlug(data.slug);
      if (desired !== current.slug) {
        newSlug = await this.ensureUniqueSlug(desired);
      }
    }
    let newPath = current.path;
    if (parentChanged || newSlug !== current.slug) {
      const basePath = newParentDoc
        ? newParentModel === 'ParentCategory'
          ? (newParentDoc as ParentCategoryDocument).slug
          : (newParentDoc as CategoryDocument).path
        : current.parent
          ? await (async () => {
              if (current.parentModel === 'ParentCategory') {
                const p = await this.parentCategoryModel
                  .findById(current.parent)
                  .lean()
                  .exec();
                return p?.slug ?? '';
              }
              const p = await this.categoryModel
                .findById(current.parent)
                .lean()
                .exec();
              return p?.path ?? '';
            })()
          : '';

      newPath = basePath ? `${basePath}/${newSlug}` : newSlug;
    }
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
        const newDocDepth = Math.max(0, updatedPath.split('/').length - 1);
        await this.categoryModel
          .updateOne(
            { _id: doc._id },
            { path: updatedPath, depth: newDocDepth },
          )
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
      .findOne({ slug: normalized })
      .lean<CategoryLean>()
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
    if (!cat) throw new NotFoundException(`Категория не найдена`);
    const prev = cat.imageUrl;
    if (prev)
      try {
        rmSync(`.${prev}`, { force: true });
      } catch {
        /* empty */
      }
    cat.imageUrl = this.buildCategoryImageUrl(slug, filename);
    await cat.save();
    return { imageUrl: cat.imageUrl };
  }

  async clearImage(slug: string) {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) throw new NotFoundException('Категория не найдена');
    if (cat.imageUrl)
      try {
        rmSync(`.${cat.imageUrl}`, { force: true });
      } catch {
        /* empty */
      }
    cat.imageUrl = undefined;
    await cat.save();
    return { success: true };
  }

  async incrementViews(slug: string) {
    const updated = await this.categoryModel
      .findOneAndUpdate({ slug }, { $inc: { views: 1 } }, { new: true })
      .lean<Category & { _id: any }>()
      .exec();
    if (!updated) throw new NotFoundException('Категория не найдена');
  }
}
