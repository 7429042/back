import { Injectable } from '@nestjs/common';
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
    return { id: (doc._id as Types.ObjectId).toString() };
  }

  async findAll(params: {
    status?: 'draft' | 'published',
    sortByViews?: boolean,
    limit?: number,
    offset?: number,
  }) {
    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;

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
}
