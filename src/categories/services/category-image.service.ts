import { Injectable, NotFoundException } from '@nestjs/common';
import { Model } from 'mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { CategoryCacheService } from './category-cache.service';
import { InjectModel } from '@nestjs/mongoose';
import { rmSync } from 'node:fs';
import { CategoryUtilsService } from './category-utils.service';

@Injectable()
export class CategoryImageService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly cacheService: CategoryCacheService,
    private readonly utils: CategoryUtilsService,
  ) {}

  private deleteFile(path: string): void {
    try {
      rmSync(path, { force: true });
    } catch {
      // Silent fail
    }
  }

  async setImage(
    slug: string,
    filename: string,
  ): Promise<{ imageUrl: string }> {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) throw new NotFoundException('Категория не найдена');

    // Удаляем старое изображение
    if (cat.imageUrl) {
      this.deleteFile(`.${cat.imageUrl}`);
    }

    cat.imageUrl = this.utils.buildCategoryImageUrl(slug, filename);
    await cat.save();
    await this.cacheService.invalidateOnChange();

    return { imageUrl: cat.imageUrl };
  }

  async clearImage(slug: string): Promise<{ success: boolean }> {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) throw new NotFoundException('Категория не найдена');

    if (cat.imageUrl) {
      this.deleteFile(`.${cat.imageUrl}`);
    }

    cat.imageUrl = undefined;
    await cat.save();
    await this.cacheService.invalidateOnChange();

    return { success: true };
  }
}
