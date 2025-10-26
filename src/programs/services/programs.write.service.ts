import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Program } from '../schemas/programSchema';
import { ProgramResponseDto } from '../dto/program-response.dto';
import { AnyProgram, mapProgram } from '../mappers/program.mapper';
import { ProgramsRepository } from './programs.repository';
import { ProgramsCacheService } from './programs.cache';
import { normalizeSlug } from './programs.utils';

@Injectable()
export class ProgramsWriteService {
  constructor(
    private readonly repo: ProgramsRepository,
    private readonly programsCache: ProgramsCacheService,
  ) {}
  private async ensureUniqueSlug(base: string, executedId: Types.ObjectId) {
    let candidate = base;
    let i = 2;
    while (
      await this.repo.exists(
        executedId
          ? ({ slug: candidate, _id: { $ne: executedId } } as any)
          : ({ slug: candidate } as any),
      )
    ) {
      candidate = `${base}-${i++}`;
    }
    return candidate;
  }
  async createDraft(categoryId: Types.ObjectId): Promise<{ id: string }> {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw new BadRequestException('Invalid category ID');
    }
    const doc = await this.repo.createDraft(categoryId);
    return { id: doc._id.toString() };
  }

  async publish(id: string): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Program not found');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Program not found');
    if (doc.status === 'published')
      throw new BadRequestException('Program is already published');

    const errors: string[] = [];
    if (!doc.title || !doc.title.trim()) {
      errors.push('Title is required');
    } else {
      const titleTrim = doc.title.trim();
      if (titleTrim.length < 3)
        errors.push('Title must be at least 3 characters');
      const baseSlug = normalizeSlug(titleTrim);
      const duplicate = await this.repo.exists({
        slug: baseSlug,
        status: 'published',
        _id: { $ne: doc._id },
      } as any);
      if (duplicate)
        errors.push('Program with the same title is already published');
    }
    if (!doc.category) errors.push('Category is required');
    if (typeof doc.hours !== 'number' || doc.hours <= 0)
      errors.push('Hours must be a positive number');
    if (errors.length)
      throw new BadRequestException(
        `Cannot publish program: ${errors.join(', ')}`,
      );

    const base = normalizeSlug(doc.title!.trim());
    doc.slug = await this.ensureUniqueSlug(base, doc._id);
    doc.status = 'published';
    await doc.save();

    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();

    const view = (await this.repo.findByIdLean(
      doc._id.toString(),
    )) as AnyProgram | null;
    if (!view) throw new NotFoundException('Program not found');
    return mapProgram(view);
  }
  async updateDraft(
    id: string,
    updates: Partial<
      Pick<Program, 'title' | 'description' | 'hours' | 'category' | 'price'>
    >,
  ): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Program not found');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Program not found');
    if (doc.status !== 'draft')
      throw new BadRequestException('Program is not in draft status');

    if (typeof updates.title !== 'undefined') {
      doc.title = updates.title as any;
      if (updates.title && updates.title.trim()) {
        const base = normalizeSlug(updates.title);
        doc.slug = await this.ensureUniqueSlug(base, doc._id);
      } else {
        doc.slug = undefined;
      }
    }
    if (typeof updates.description !== 'undefined')
      doc.description = updates.description as any;
    if (typeof updates.hours !== 'undefined') doc.hours = updates.hours as any;
    if (typeof updates.category !== 'undefined')
      doc.category = updates.category as any;
    if (typeof (updates as any).price !== 'undefined')
      (doc as any).price = (updates as any).price;

    await doc.save();

    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();

    const view = (await this.repo.findByIdLean(
      doc._id.toString(),
    )) as AnyProgram | null;
    if (!view) throw new NotFoundException('Program not found');
    return mapProgram(view);
  }

  async deleteDraft(id: string): Promise<{ deleted: true }> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Program not found');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Program not found');
    if (doc.status !== 'draft')
      throw new BadRequestException('Program is not in draft status');

    await this.repo.findByIdAndDelete(doc._id.toString()).exec();
    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();
    return { deleted: true };
  }
}
