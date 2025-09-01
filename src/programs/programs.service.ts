import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Program, ProgramDocument } from './schemas/programSchema';
import slugify from '@sindresorhus/slugify';

@Injectable()
export class ProgramsService {
  constructor(
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  private normalizeSlug(input: string) {
    return slugify(input, { separator: '-', lowercase: true });
  }

  private async ensureUniqueSlug(slug: string, executedId: Types.ObjectId) {
    let candidate = slug;
    let i = 2;
    while (
      await this.programModel.exists(
        executedId
          ? { slug: candidate, _id: { $ne: executedId } }
          : { slug: candidate },
      )
    ) {
      candidate = `${slug}-${i++}`;
    }
    return candidate;
  }

  private escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

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

    return query.lean().exec();
  }

  async findAllWithMeta(params: {
    status?: 'draft' | 'published';
    sortByViews?: boolean;
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
    text?: string;
  }) {
    const filter: FilterQuery<Program> = {};
    if (params.status) filter.status = params.status;
    if (params.categoryIds && params.categoryIds.length > 0)
      filter.category = { $in: params.categoryIds };
    if (params.text) {
      const safe = new RegExp(this.escapeRegExp(params.text), 'i');
      filter.$or = [{ title: safe }, { description: safe }];
    }

    const MAX_LIMIT = 100;
    const limit = Math.min(Math.max(params.limit ?? 20, 1), MAX_LIMIT);
    const offset = Math.max(params.offset ?? 0, 0);

    const baseQuery = this.programModel.find(filter);
    if (params.sortByViews) {
      baseQuery.sort({ views: -1, createdAt: -1 });
    } else {
      baseQuery.sort({ createdAt: -1 });
    }

    const [items, total] = await Promise.all([
      baseQuery.skip(offset).limit(limit).lean().exec(),
      this.programModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      limit,
      offset,
    };
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

  async findOneBySlug(slug: string, options?: { incrementView?: boolean }) {
    const incrementView = options?.incrementView ?? true;
    const normalized = this.normalizeSlug(slug);

    const doc = incrementView
      ? await this.programModel
          .findOneAndUpdate(
            { slug: normalized },
            { $inc: { views: 1 } },
            { new: true },
          )
          .exec()
      : await this.programModel.findOne({ slug: normalized }).exec();
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
    if (!doc.slug || !doc.slug.trim()) {
      const base = this.normalizeSlug(doc.title!);
      doc.slug = await this.ensureUniqueSlug(base, doc._id);
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
      if (updates.title && updates.title.trim()) {
        const base = this.normalizeSlug(updates.title);
        doc.slug = await this.ensureUniqueSlug(base, doc._id);
      } else {
        doc.slug = undefined;
      }
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

  async deleteDraft(id: string) {
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
    await doc.deleteOne({ id: doc._id }).exec();
    return { deleted: true };
  }
}
