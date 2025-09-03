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
