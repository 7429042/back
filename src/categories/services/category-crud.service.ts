import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { Model } from 'mongoose';
import { CategoryHierarchyService } from './category-hierarchy.service';
import { CategoryCacheService } from './category-cache.service';
import { InjectModel } from '@nestjs/mongoose';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { CategoryLean } from '../categories.service';
import { CategoryUtilsService } from './category-utils.service';

@Injectable()
export class CategoryCrudService {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
    private readonly hierarchyService: CategoryHierarchyService,
    private readonly cacheService: CategoryCacheService,
    private readonly utils: CategoryUtilsService,
  ) {}

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    const name = dto.name.trim();
    const providedSlug = dto.slug?.trim();

    if (!dto.parentSlug) {
      throw new BadRequestException(
        'Родительский slug обязателен: категория должна принадлежать одной из трех родительских категорий',
      );
    }

    const parentRoot = await this.hierarchyService.findParentBySlug(
      dto.parentSlug,
    );
    if (!parentRoot) {
      throw new BadRequestException(
        `Родитель с slug "${dto.parentSlug}" не найден`,
      );
    }

    const rawSlugSource =
      providedSlug && providedSlug.length > 0 ? providedSlug : name;
    const normalized = this.utils.normalizeSlug(rawSlugSource);
    const uniqueSlug = await this.utils.ensureUniqueSlug(normalized);

    const path = `${parentRoot.slug}/${uniqueSlug}`;

    try {
      const created = await this.categoryModel.create({
        name,
        slug: uniqueSlug,
        parentModel: 'ParentCategory',
        path,
      });
      await this.cacheService.invalidateOnChange();
      return created;
    } catch (e: unknown) {
      if (this.utils.isMongoDuplicateKey(e)) {
        throw new BadRequestException(
          `Категория с slug "${uniqueSlug}" уже существует`,
        );
      }
      throw e;
    }
  }

  async ensure(dto: CreateCategoryDto): Promise<CategoryLean> {
    const normalized = this.utils.normalizeSlug(dto.slug?.trim() ?? dto.name);
    const existing = await this.categoryModel
      .findOne({ slug: normalized })
      .lean<CategoryLean>()
      .exec();
    if (existing) return existing;
    const created = await this.create({ ...dto, slug: normalized });
    return {
      _id: created._id,
      name: created.name,
      slug: created.slug,
      path: created.path,
      imageUrl: created.imageUrl,
      views: created.views,
    };
  }

  async updateBySlug(
    slug: string,
    data: Partial<{ name: string; slug: string; parentSlug: string }>,
  ): Promise<CategoryLean> {
    const normalized = this.utils.normalizeSlug(slug);
    const current: CategoryDocument | null = await this.categoryModel
      .findOne({ slug: normalized })
      .exec();
    if (!current) {
      throw new NotFoundException(
        `Категория с slug "${normalized}" не найдена`,
      );
    }

    const updates: Partial<
      Pick<Category, 'name' | 'slug' | 'path' | 'parentModel'>
    > = {};

    if (data.name) {
      updates.name = data.name.trim();
    }

    let newSlug = current.slug;
    if (data.slug && data.slug.trim().length > 0) {
      const desiredSlug = this.utils.normalizeSlug(data.slug);
      if (desiredSlug !== current.slug)
        newSlug = await this.utils.ensureUniqueSlug(desiredSlug);
    }

    let basePath: string;
    if (Object.prototype.hasOwnProperty.call(data, 'parentSlug')) {
      if (data.parentSlug === null) {
        throw new BadRequestException('Родительский slug обязателен');
      }
      const parentRoot = await this.hierarchyService.findParentBySlug(
        String(data.parentSlug),
      );
      if (!parentRoot) {
        throw new BadRequestException(
          `Родитель с slug "${data.parentSlug}" не найден`,
        );
      }
      updates.parentModel = 'ParentCategory';
      basePath = parentRoot.slug;
    } else {
      const parts = String(current.path || '').split('/');
      basePath = parts[0] || '';
    }

    const newPath = basePath ? `${basePath}/${newSlug}` : newSlug;
    updates.slug = newSlug;
    updates.path = newPath;

    const prevPath = current.path;
    await this.categoryModel.updateOne({ _id: current._id }, updates).exec();

    if (prevPath !== newPath) {
      await this.hierarchyService.updateDescendantsPaths(
        prevPath,
        newPath,
        current._id,
      );
    }
    await this.cacheService.invalidateOnChange([slug, newSlug]);
    const updated = await this.categoryModel
      .findById(current._id)
      .lean<CategoryLean>()
      .exec();

    if (!updated) {
      throw new NotFoundException(
        `Категория не найдена после обновления (ID: ${current._id.toString()})`,
      );
    }

    return updated;
  }

  async deleteBySlug(slug: string): Promise<{ deleted: boolean }> {
    await this.hierarchyService.deleteWithDescendants(slug);
    await this.cacheService.invalidateOnChange([slug]);
    return { deleted: true };
  }
}
