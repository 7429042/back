import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  ParentCategory,
  ParentCategoryDocument,
} from './schemas/category.schema';
import { Model, Types } from 'mongoose';
import { PARENT_CATEGORIES_LIST } from './constants/parent-categories.constant';
import { CategoryQueryService } from './services/category-query.service';
import { CategoryCrudService } from './services/category-crud.service';
import { CategoryImageService } from './services/category-image.service';
import { CategoryAnalyticsService } from './services/category-analytics.service';
import { CategoryHierarchyService } from './services/category-hierarchy.service';
import { CreateCategoryDto } from './dto/create-category.dto';

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
  static readonly BASE_PROJECTION = {
    name: 1,
    slug: 1,
    path: 1,
    imageUrl: 1,
    views: 1,
  } as const;

  constructor(
    @InjectModel(ParentCategory.name)
    private readonly parentCategoryModel: Model<ParentCategoryDocument>,
    private readonly queryService: CategoryQueryService,
    private readonly crudService: CategoryCrudService,
    private readonly imageService: CategoryImageService,
    private readonly analyticsService: CategoryAnalyticsService,
    private readonly hierarchyService: CategoryHierarchyService,
  ) {}

  async onModuleInit() {
    try {
      for (const { name, slug } of PARENT_CATEGORIES_LIST) {
        await this.parentCategoryModel.updateOne(
          { $or: [{ slug }, { name }] },
          { $set: { name, slug } },
          { upsert: true },
        );
      }
    } catch (e) {
      console.warn('Ошибка инициализации категорий', e);
    }
  }

  async findAll(): Promise<CategoryLean[]> {
    return this.queryService.findAll();
  }

  async findBySlug(slug: string): Promise<CategoryLean> {
    return this.queryService.findBySlug(slug);
  }

  async search(q: string, limit?: number) {
    return this.queryService.search(q, limit);
  }

  async create(dto: CreateCategoryDto) {
    return this.crudService.create(dto);
  }

  async ensure(dto: CreateCategoryDto) {
    return this.crudService.ensure(dto);
  }

  async updateBySlug(
    slug: string,
    data: Partial<{ name: string; slug: string; parentSlug: string }>,
  ) {
    return this.crudService.updateBySlug(slug, data);
  }

  async deleteBySlug(slug: string) {
    return this.crudService.deleteBySlug(slug);
  }

  async collectCategoryAndDescendantsIds(slug: string) {
    return this.hierarchyService.collectCategoryAndDescendantsIds(slug);
  }

  async setImage(slug: string, filename: string) {
    return this.imageService.setImage(slug, filename);
  }

  async clearImage(slug: string) {
    return this.imageService.clearImage(slug);
  }

  async incrementViews(slug: string) {
    return this.analyticsService.incrementViews(slug);
  }

  async getParentsCounters() {
    return this.analyticsService.getParentsCounters();
  }
}
