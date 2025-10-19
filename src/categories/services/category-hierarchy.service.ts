import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Category,
  CategoryDocument,
  ParentCategory,
  ParentCategoryDocument,
} from '../schemas/category.schema';
import { Model, Types } from 'mongoose';
import { CategoryCacheService } from './category-cache.service';
import { CategoryUtilsService } from './category-utils.service';

@Injectable()
export class CategoryHierarchyService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel(ParentCategory.name)
    private readonly parentCategoryModel: Model<ParentCategory>,
    private readonly cacheService: CategoryCacheService,
    private readonly utils: CategoryUtilsService,
  ) {}

  async findParentBySlug(
    parentSlug: string,
  ): Promise<ParentCategoryDocument | null> {
    const normalized = this.utils.normalizeSlug(parentSlug);
    return this.parentCategoryModel.findOne({ slug: normalized }).exec();
  }

  async collectCategoryAndDescendantsIds(
    slug: string,
  ): Promise<Types.ObjectId[]> {
    const key = this.cacheService.getIdsKey(slug);
    const cached = await this.cacheService.get<string[]>(key);
    if (cached) return cached.map((id) => new Types.ObjectId(id));

    const normalized = this.utils.normalizeSlug(slug);
    const cat = await this.categoryModel.findOne({ slug: normalized }).exec();
    if (!cat) {
      throw new NotFoundException(`Категория с slug "${slug}" не найдена`);
    }

    const safePath = this.utils.escapeRegExp(cat.path);
    const regex = new RegExp(`^${safePath}(\\/|$)`);
    const all = await this.categoryModel
      .find({ path: regex }, { _id: 1 })
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    const ids = all.map((item) => new Types.ObjectId(item._id));
    await this.cacheService.set(key, ids.map(String), 'ids');
    return ids;
  }

  async updateDescendantsPaths(
    oldPath: string,
    newPath: string,
    excludeId: Types.ObjectId,
  ): Promise<void> {
    const safePrev = this.utils.escapeRegExp(oldPath);
    const regex = new RegExp(`^${safePrev}(/|$)`);
    const descendants = await this.categoryModel.find({ path: regex }).exec();

    // Оптимизация: используем bulkWrite вместо цикла
    const operations = descendants
      .filter((doc) => !doc._id.equals(excludeId))
      .map((doc) => ({
        updateOne: {
          filter: { _id: doc._id },
          update: { path: `${newPath}${doc.path.substring(oldPath.length)}` },
        },
      }));

    if (operations.length > 0) {
      await this.categoryModel.bulkWrite(operations);
    }
  }

  async deleteWithDescendants(slug: string): Promise<void> {
    const normalized = this.utils.normalizeSlug(slug);
    const current = await this.categoryModel
      .findOne({ slug: normalized }, { _id: 1, path: 1 })
      .lean<{ _id: Types.ObjectId; path: string }>()
      .exec();

    if (!current) {
      throw new NotFoundException(
        `Категория с slug "${normalized}" не найдена`,
      );
    }

    const safePath = this.utils.escapeRegExp(current.path);
    const regex = new RegExp(`^${safePath}(\\/|$)`);
    await this.categoryModel.deleteMany({ path: regex }).exec();
  }
}
