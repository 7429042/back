import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import slugify from '@sindresorhus/slugify';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  private readonly idsCache = new Map<
    string,
    { expires: number; ids: Types.ObjectId[] }
  >();
  private readonly IDS_TTL_MS = 60_000;

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

  async findAll() {
    return this.categoryModel.find().sort({ path: 1 }).lean().exec();
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
      .lean()
      .exec();
    if (existing) return existing;
    // If not exists, try to create
    return this.create({ ...dto, slug: normalized });
  }

  async findBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const cat = await this.categoryModel
      .findOne({ slug: normalized })
      .lean()
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
    return this.categoryModel.findById(current._id).lean().exec();
  }

  async deleteBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const current = await this.categoryModel
      .findOne({ slug: normalized })
      .lean()
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
    const all = await this.categoryModel
      .find({ path: regex }, { _id: 1 })
      .lean()
      .exec();
    const ids = all.map((item) => new Types.ObjectId(item._id));

    this.idsCache.set(key, { expires: now + this.IDS_TTL_MS, ids });
    return ids;
  }
}
