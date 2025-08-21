import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Category, CategoryDocument } from './schemas/category.schema';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class CategoriesService {
  constructor(@InjectModel(Category.name) private readonly categoryModel: Model<CategoryDocument>) {
  }

  async create(dto: CreateCategoryDto) {
    let parent: CategoryDocument | null = null;
    if (dto.parentSlug) {
      parent = await this.categoryModel.findOne({ slug: dto.parentSlug }).exec();
      if (!parent) {
        throw new BadRequestException(`Parent category with slug "${dto.parentSlug}" not found`);
      }
    }

    const path = parent ? `${parent.path}/${dto.slug}` : dto.slug;
    const depth = parent ? parent['depth'] + 1 : 0;

    try {
      const created = await this.categoryModel.create({
        name: dto.name,
        slug: dto.slug,
        parent: parent?._id ?? undefined,
        path,
        depth,
      });
      return created;
    } catch (e) {
      if (e.code === 11000) {
        throw new BadRequestException(`Category with slug "${dto.slug}" already exists`);
      }
      throw e;
    }
  }

  async findBySlug(slug: string) {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) {
      throw new BadRequestException(`Category with slug "${slug}" not found`);
    }
    return cat;
  }

  async collectCategoryAndDescendantsIdsBySlug(slug: string): Promise<Types.ObjectId[]> {
    const cat = await this.categoryModel.findOne({ slug }).exec();
    if (!cat) {
      throw new NotFoundException(`Category with slug "${slug}" not found`)
    }
    const regex = new RegExp(`^${cat.path}(\\/|$)`)
    const all = await this.categoryModel.find({path: regex}, {_id: 1}).lean().exec();
    return all.map(item => item._id);
  }
}
