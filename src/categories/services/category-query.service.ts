import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Model } from 'mongoose';
import { CategoryCacheService } from './category-cache.service';
import slugify from '@sindresorhus/slugify';
import { CategoryLean, CategorySearchResult } from '../categories.service';

@Injectable()
export class CategoryQueryService {
  private static readonly BASE_PROJECTION = {
    name: 1,
    slug: 1,
    path: 1,
    imageUrl: 1,
    views: 1,
  } as const;

  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly cacheService: CategoryCacheService,
  ) {}

  private normalizeSlug(input: string) {
    return slugify(input, { separator: '-', lowercase: true });
  }

  private escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findAll(): Promise<CategoryLean[]> {
    const key = this.cacheService.getAllKey();
    const cached = await this.cacheService.get<CategoryLean[]>(key);
    if (cached) return cached;

    const docs = await this.categoryModel
      .find({}, CategoryQueryService.BASE_PROJECTION)
      .sort({ path: 1 })
      .lean()
      .exec();

    const value = (docs ?? []) as CategoryLean[];
    await this.cacheService.set(key, value, 'read');
    return value;
  }

  async findBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const cat = await this.categoryModel
      .findOne({ slug: normalized }, CategoryQueryService.BASE_PROJECTION)
      .lean<CategoryLean>()
      .exec();
    if (!cat) {
      throw new NotFoundException(
        `Категория с slug "${normalized}" не найдена`,
      );
    }
    return cat;
  }

  async search(q: string, limit: number = 20): Promise<CategorySearchResult[]> {
    const query = q ? q.trim() : '';
    if (!query) return [];

    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));

    const key = this.cacheService.getSearchKey(query, safeLimit);
    const cached = await this.cacheService.get<CategorySearchResult[]>(key);
    if (cached) return cached;

    const results =
      query.length >= 2
        ? await this.searchWithTextIndex(query, safeLimit)
        : await this.searchSimple(query, safeLimit);

    await this.cacheService.set(key, results, 'read');
    return results;
  }

  private async searchWithTextIndex(
    query: string,
    limit: number,
  ): Promise<CategorySearchResult[]> {
    const regex = new RegExp(this.escapeRegExp(query), 'i');
    const docs = await this.categoryModel
      .find(
        { $or: [{ $text: { $search: query } }, { slug: regex }] },
        {
          name: 1,
          slug: 1,
          path: 1,
          imageUrl: 1,
          score: { $meta: 'textScore' },
        },
      )
      .sort({ score: { $meta: 'textScore' }, path: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs as CategorySearchResult[];
  }

  private async searchSimple(
    query: string,
    limit: number,
  ): Promise<CategorySearchResult[]> {
    const regex = new RegExp(this.escapeRegExp(query), 'i');
    const docs = await this.categoryModel
      .find(
        { $or: [{ name: regex }, { slug: regex }] },
        { name: 1, slug: 1, path: 1, imageUrl: 1 },
      )
      .sort({ path: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs as CategorySearchResult[];
  }

  async exists(slug: string): Promise<boolean> {
    return this.categoryModel.exists({ slug }).then(Boolean);
  }
}
