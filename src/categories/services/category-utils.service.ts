import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Model } from 'mongoose';
import slugify from '@sindresorhus/slugify';

@Injectable()
export class CategoryUtilsService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  normalizeSlug(input: string): string {
    return slugify(input, { separator: '-', lowercase: true });
  }

  escapeRegExp(input: string): string {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async ensureUniqueSlug(slug: string): Promise<string> {
    let candidate = slug;
    let i = 2;
    while (await this.categoryModel.exists({ slug: candidate })) {
      candidate = `${slug}-${i++}`;
    }
    return candidate;
  }

  isMongoDuplicateKey(err: unknown): err is { code: number } {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in (err as Record<string, unknown>) &&
      typeof (err as Record<string, unknown>).code === 'number' &&
      (err as { code: number }).code === 11000
    );
  }

  buildCategoryImageUrl(slug: string, filename: string): string {
    return `/uploads/categories/${slug}/${filename}`;
  }
}
