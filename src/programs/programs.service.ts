import { Injectable, NotFoundException } from '@nestjs/common';
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

  async findById(
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
}
