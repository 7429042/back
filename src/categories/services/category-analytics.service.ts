import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Category,
  CategoryDocument,
  ParentCategory,
  ParentCategoryDocument,
} from '../schemas/category.schema';
import { Model } from 'mongoose';
import { CategoryCacheService } from './category-cache.service';
import { CategoryLean } from '../categories.service';

@Injectable()
export class CategoryAnalyticsService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(ParentCategory.name)
    private readonly parentCategoryModel: Model<ParentCategoryDocument>,
    private readonly cacheService: CategoryCacheService,
  ) {}

  private static readonly PARENT_ORDER = [
    'professionalnoe-obuchenie',
    'professionalnaya-perepodgotovka',
    'povyshenie-kvalifikacii',
  ];

  async incrementViews(slug: string): Promise<CategoryLean> {
    const updated = await this.categoryModel
      .findOneAndUpdate(
        { slug },
        { $inc: { views: 1 } },
        {
          new: true,
          projection: { name: 1, slug: 1, path: 1, imageUrl: 1, views: 1 },
        },
      )
      .lean<CategoryLean>()
      .exec();

    if (!updated) throw new NotFoundException('Категория не найдена');

    // Инвалидация только списка всех категорий
    await this.cacheService.invalidateAll();
    return updated;
  }

  async getParentsCounters(): Promise<
    { slug: string; name: string; count: number }[]
  > {
    const key = this.cacheService.getParentCountersKey();
    const cached =
      await this.cacheService.get<
        { slug: string; name: string; count: number }[]
      >(key);
    if (cached) return cached;

    const [parents, buckets] = await Promise.all([
      this.parentCategoryModel.find({}, { slug: 1, name: 1 }).lean().exec(),
      this.categoryModel.aggregate<{ _id: string; count: number }>([
        {
          $project: { root: { $arrayElemAt: [{ $split: ['$path', '/'] }, 0] } },
        },
        { $group: { _id: '$root', count: { $sum: 1 } } },
      ]),
    ]);

    const counts = new Map(buckets.map((x) => [x._id, x.count]));
    const nameBySlug = new Map(parents.map((x) => [x.slug, x.name]));

    const result = CategoryAnalyticsService.PARENT_ORDER.map((slug) => ({
      slug,
      name: nameBySlug.get(slug) ?? slug,
      count: counts.get(slug) ?? 0,
    }));

    await this.cacheService.set(key, result, 'read');
    return result;
  }
}
