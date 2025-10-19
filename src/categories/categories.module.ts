import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Category,
  CategorySchema,
  ParentCategory,
  ParentCategorySchema,
} from './schemas/category.schema';
import { CategoryCacheService } from './services/category-cache.service';
import { CategoryQueryService } from './services/category-query.service';
import { CategoryCrudService } from './services/category-crud.service';
import { CategoryHierarchyService } from './services/category-hierarchy.service';
import { CategoryImageService } from './services/category-image.service';
import { CategoryAnalyticsService } from './services/category-analytics.service';
import { CategoryUtilsService } from './services/category-utils.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Category.name,
        schema: CategorySchema,
      },
      {
        name: ParentCategory.name,
        schema: ParentCategorySchema,
      },
    ]),
  ],
  controllers: [CategoriesController],
  providers: [
    CategoriesService,
    CategoryCacheService,
    CategoryQueryService,
    CategoryCrudService,
    CategoryHierarchyService,
    CategoryImageService,
    CategoryAnalyticsService,
    CategoryUtilsService,
  ],
  exports: [
    CategoryQueryService,
    CategoryCrudService,
    CategoryHierarchyService,
    CategoryAnalyticsService,
    CategoriesService,
    CategoryUtilsService,
  ],
})
export class CategoriesModule {}
