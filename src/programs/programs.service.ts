import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Program, ProgramDocument } from './schemas/programSchema';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  async createDraft(): Promise<{ id: string }> {
    const doc = await this.programModel.create({ status: 'draft' });
    return { id: doc._id.toString() };
  }

  async findAll(params: {
    status?: 'draft' | 'published';
    sortByViews?: boolean;
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
  }) {
    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds && params.categoryIds.length > 0) {
      filter.category = {
        $in: params.categoryIds,
      };
    }

    const query = this.programModel.find(filter);
    if (params.sortByViews) {
      query.sort({ views: -1, createdAt: -1 });
    } else {
      query.sort({ createdAt: -1 });
    }

    if (params.limit) {
      query.limit(params.limit);
    }

    if (params.offset) {
      query.skip(params.offset);
    }

    return query.exec();
  }

  async findOneById(
    id: string,
    options?: {
      incrementView?: boolean;
    },
  ) {
    const incrementView = options?.incrementView ?? true;

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = incrementView
      ? await this.programModel
          .findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true })
          .exec()
      : await this.programModel.findById(id).exec();

    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    return doc;
  }

  async publish(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = await this.programModel.findById(id).exec();
    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    if (doc.status === 'published') {
      throw new BadRequestException('Program is already published');
    }

    const errors: string[] = [];
    if (!doc.title || !doc.title.trim()) {
      errors.push('Title is required');
    }
    if (!doc.category) {
      errors.push('Category is required');
    }
    if (typeof doc.hours !== 'number' || doc.hours <= 0) {
      errors.push('Hours must be a positive number');
    }
    if (!doc.categoryType) {
      errors.push('Category type is required');
    }
    if (doc.categoryType === 'dpo' && !doc.dpoSubcategory) {
      errors.push('DPO subcategory is required');
    }
    if (errors.length > 0) {
      throw new BadRequestException(
        `Cannot publish program: ${errors.join(', ')}`,
      );
    }

    doc.status = 'published';
    await doc.save();
    return doc;
  }

  async updateDraft(
    id: string,
    updates: Partial<
      Pick<
        Program,
        | 'title'
        | 'description'
        | 'hours'
        | 'categoryType'
        | 'dpoSubcategory'
        | 'category'
      >
    >,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Program not found');
    }

    const doc = await this.programModel.findById(id).exec();

    if (!doc) {
      throw new NotFoundException('Program not found');
    }
    if (doc.status !== 'draft') {
      throw new BadRequestException('Program is not in draft status');
    }
    if (typeof updates.title !== 'undefined') {
      doc.title = updates.title;
    }
    if (typeof updates.description !== 'undefined') {
      doc.description = updates.description;
    }
    if (typeof updates.hours !== 'undefined') {
      doc.hours = updates.hours;
    }
    if (typeof updates.categoryType !== 'undefined') {
      doc.categoryType = updates.categoryType;
    }
    if (typeof updates.dpoSubcategory !== 'undefined') {
      doc.dpoSubcategory = updates.dpoSubcategory;
    }
    if (typeof updates.category !== 'undefined') {
      doc.category = updates.category;
    }
    await doc.save();
    return doc;
  }
}
