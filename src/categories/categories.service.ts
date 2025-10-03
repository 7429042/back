import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import slugify from '@sindresorhus/slugify';
import { ConfigService } from '@nestjs/config';

export interface CategoryTreeNode {
  _id: Types.ObjectId | string;
  name: string;
  slug: string;
  path: string;
  depth: number;
  children: CategoryTreeNode[];
}

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
  depth: number;
};

@Injectable()
export class CategoriesService implements OnModuleInit {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly config: ConfigService,
  ) {
    const ttl = Number(this.config.get('CATEGORIES_IDS_TTL_MS'));
    this.IDS_TTL_MS = Number.isFinite(ttl) && ttl > 0 ? ttl : 60_000;
    const readTtl = Number(this.config.get('CATEGORIES_CACHE_TTL_MS'));
    this.READ_TTL_MS =
      Number.isFinite(readTtl) && readTtl > 0 ? readTtl : 120_000;
  }

  async onModuleInit() {
    // Seed default categories hierarchy (idempotent)
    try {
      const root1Name = 'профессиональное обучение';
      const root2Name = 'дополнительное профессиональное образование';
      const root1Slug = this.normalizeSlug(root1Name);
      const root2Slug = this.normalizeSlug(root2Name);

      await this.ensure({ name: root1Name, slug: root1Slug });
      await this.ensure({ name: root2Name, slug: root2Slug });

      const child1Name = 'повышение квалификации';
      const child2Name = 'профессиональная переподготовка';
      await this.ensure({
        name: child1Name,
        slug: this.normalizeSlug(child1Name),
        parentSlug: root2Slug,
      });
      await this.ensure({
        name: child2Name,
        slug: this.normalizeSlug(child2Name),
        parentSlug: root2Slug,
      });
    } catch (e) {
      // Avoid crashing app on startup because of seeding errors; log and continue
      // eslint-disable-next-line no-console
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

  async getTree(): Promise<CategoryTreeNode[]> {
    const key = 'read:tree';
    const now = Date.now();
    const cached = this.readCache.get(key);
    if (cached && cached.expires > now)
      return cached.value as CategoryTreeNode[];

    const docs = (await this.categoryModel
      .find({}, { name: 1, slug: 1, path: 1, depth: 1, parent: 1 })
      .sort({ path: 1 })
      .lean()
      .exec()) as CategoryLean[];

    const byId = new Map<string, CategoryTreeNode>();
    const roots: CategoryTreeNode[] = [];

    for (const d of docs) {
      const id = String(d._id);
      byId.set(id, {
        _id: d._id,
        name: d.name,
        slug: d.slug,
        path: d.path,
        depth: d.depth ?? (d.path ? d.path.split('/').length - 1 : 0),
        children: [],
      });
    }

    for (const d of docs) {
      const node = byId.get(String(d._id))!;
      const parentId = d.parent ? String(d.parent) : null;
      if (parentId && byId.has(parentId)) {
        byId.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    this.readCache.set(key, { expires: now + this.READ_TTL_MS, value: roots });
    return roots;
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    const providedSlug = dto.slug?.trim();

    let parent: CategoryDocument | null = null;
    if (dto.parentSlug) {
      const normalizedParentSlug = this.normalizeSlug(dto.parentSlug);
      parent = await this.categoryModel
        .findOne({ slug: normalizedParentSlug })
        .exec();
      if (!parent) {
        throw new BadRequestException(
          `Parent category with slug "${dto.parentSlug}" not found`,
        );
      }
    }

    const rawSlugSource =
      providedSlug && providedSlug.length > 0 ? providedSlug : name;
    const normalized = this.normalizeSlug(rawSlugSource);
    const uniqueSlug = await this.ensureUniqueSlug(normalized);

    const path = parent ? `${parent.path}/${uniqueSlug}` : uniqueSlug;
    const depth = parent ? parent['depth'] + 1 : 0;

    const hasMongoCode = (err: unknown): err is { code: number } =>
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as Record<string, unknown>).code === 'number';

    try {
      const created = await this.categoryModel.create({
        name: dto.name,
        slug: uniqueSlug,
        parent: parent?._id ?? undefined,
        path,
        depth,
      });
      this.clearIdsCache();
      this.clearReadCache();
      return created;
    } catch (e) {
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

  async getBreadcrumbs(slug: string) {
    const cat = await this.findBySlug(slug);
    const parts = typeof cat.path === 'string' ? cat.path.split('/') : [];
    const paths: string[] = [];
    for (let i = 0; i < parts.length; i++) {
      const p = parts.slice(0, i + 1).join('/');
      if (p) paths.push(p);
    }
    if (paths.length === 0) return [];
    const docs = (await this.categoryModel
      .find({ path: { $in: paths } }, { name: 1, slug: 1, path: 1, depth: 1 })
      .lean()
      .exec()) as Omit<CategorySearchResult, 'score'>[];
    const order = new Map(paths.map((p, idx) => [p, idx] as const));
    docs.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    return docs;
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
      Pick<Category, 'name' | 'slug' | 'path' | 'depth'>
    > & { parent?: Types.ObjectId } = {};

    // Update name
    if (typeof data.name === 'string') {
      updates.name = data.name.trim();
    }

    // Resolve parent if changing
    let parent: CategoryDocument | null = null;
    let parentChanged = false;
    if (typeof data.parentSlug === 'string') {
      const parentSlugNorm = this.normalizeSlug(data.parentSlug);
      parent = await this.categoryModel
        .findOne({ slug: parentSlugNorm })
        .exec();
      if (!parent) {
        throw new BadRequestException(
          `Parent category with slug "${data.parentSlug}" not found`,
        );
      }
      // Prevent self-parenting and descendant-parenting cycles
      if (parent._id.equals(current._id)) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      const currentPath = current.path;
      if (
        parent.path === currentPath ||
        parent.path.startsWith(currentPath + '/')
      ) {
        throw new BadRequestException(
          'Category cannot assign its descendant as a parent',
        );
      }
      if (
        !current.parent ||
        parent._id.toString() !== current.parent.toString()
      ) {
        parentChanged = true;
        updates.parent = parent._id;
      }
    } else if (data.parentSlug === null) {
      // explicit set to root if passed null (not standard in DTO, but guard anyway)
      updates.parent = undefined;
      parentChanged = true;
    }

    // Determine new slug
    let newSlug = current.slug;
    if (typeof data.slug === 'string' && data.slug.trim().length > 0) {
      const desired = this.normalizeSlug(data.slug);
      if (desired !== current.slug) {
        newSlug = await this.ensureUniqueSlug(desired);
      }
    }

    // Compute new path/depth if needed
    let newPath = current.path;
    let newDepth = current['depth'];
    if (parentChanged || newSlug !== current.slug) {
      const base = parent
        ? parent.path
        : current.parent
          ? ((await this.categoryModel.findById(current.parent).lean().exec())
              ?.path ?? '')
          : '';
      const parentPath = parent ? parent.path : current.parent ? base : '';
      newPath = parentPath ? `${parentPath}/${newSlug}` : newSlug;
      newDepth = parent ? parent['depth'] + 1 : 0;
    }

    updates.slug = newSlug;
    updates.path = newPath;
    updates.depth = newDepth;

    // Save current updates
    const prevPath = current.path;
    await this.categoryModel.updateOne({ _id: current._id }, updates).exec();

    // If path changed, update descendants paths
    if (prevPath !== newPath) {
      const safePrev = this.escapeRegExp(prevPath);
      const regex = new RegExp(`^${safePrev}(\\/|$)`);
      const descendants = await this.categoryModel.find({ path: regex }).exec();
      for (const doc of descendants) {
        if (doc._id.equals(current._id)) continue;
        const suffix = doc.path.substring(prevPath.length);
        const updatedPath = `${newPath}${suffix}`;
        const newDocDepth = updatedPath.split('/').length - 1; // root depth 0
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
}
