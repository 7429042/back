import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
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
  private async ensureUniqueSlug(base: string, excludeId: Types.ObjectId) {
    let candidate = base;
    let i = 2;
    while (true) {
      const filter: FilterQuery<Program> = { slug: candidate };

      // Исключаем текущий документ из проверки (при обновлении)
      if (excludeId) {
        filter._id = { $ne: excludeId };
      }

      const exists = await this.repo.exists(filter);
      if (!exists) break;

      candidate = `${base}-${i++}`;
    }
    return candidate;
  }

  async createDraft(categoryId: Types.ObjectId): Promise<{ id: string }> {
    if (!Types.ObjectId.isValid(categoryId)) {
      throw new BadRequestException('Неверный ID категории');
    }
    const doc = await this.repo.createDraft(categoryId);
    return { id: doc._id.toString() };
  }

  async publish(id: string): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Программа не найдена');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Программа не найдена');
    if (doc.status === 'published')
      throw new BadRequestException('Программа уже опубликована');

    const errors: string[] = [];
    if (!doc.title || !doc.title.trim()) {
      errors.push('Название обязательно');
    } else {
      const titleTrim = doc.title.trim();
      if (titleTrim.length < 3)
        errors.push('Название должно быть не менее 3 символов');

      const baseSlug = normalizeSlug(titleTrim);
      const filter: FilterQuery<Program> = {
        slug: baseSlug,
        status: 'published',
        _id: { $ne: doc._id },
      };

      const duplicate = await this.repo.exists(filter);
      if (duplicate) errors.push('Программа с таким названием уже существует');
    }
    if (!doc.category) errors.push('Категория обязательна');
    if (typeof doc.hours !== 'number' || doc.hours <= 0)
      errors.push('Часы должны быть положительным числом');
    if (errors.length)
      throw new BadRequestException(
        `Невозможно опубликовать программу: ${errors.join(', ')}`,
      );

    const base = normalizeSlug(doc.title!.trim());
    doc.slug = await this.ensureUniqueSlug(base, doc._id);
    doc.status = 'published';
    await doc.save();

    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();

    const view = await this.repo.findByIdLean<AnyProgram>(doc._id.toString());
    if (!view) throw new NotFoundException('Программа не найдена');
    return mapProgram(view);
  }

  async updateDraft(
    id: string,
    updates: Partial<
      Pick<Program, 'title' | 'description' | 'hours' | 'category' | 'price'>
    >,
  ): Promise<ProgramResponseDto> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Программа не найдена');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Программа не найдена');
    if (doc.status !== 'draft')
      throw new BadRequestException('Статус программы не черновик');

    if (typeof updates.title !== 'undefined') {
      doc.title = updates.title;
      if (updates.title && updates.title.trim()) {
        const base = normalizeSlug(updates.title);
        doc.slug = await this.ensureUniqueSlug(base, doc._id);
      } else {
        doc.slug = undefined;
      }
    }
    if (typeof updates.description !== 'undefined')
      doc.description = updates.description;
    if (typeof updates.hours !== 'undefined') doc.hours = updates.hours;
    if (typeof updates.category !== 'undefined')
      doc.category = updates.category;
    if (typeof updates.price !== 'undefined') doc.price = updates.price;

    await doc.save();

    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();

    const view = await this.repo.findByIdLean<AnyProgram>(doc._id.toString());
    if (!view) throw new NotFoundException('Программа не найдена');
    return mapProgram(view);
  }

  async deleteDraft(id: string): Promise<{ deleted: true }> {
    if (!Types.ObjectId.isValid(id))
      throw new NotFoundException('Программа не найдена');

    const doc = await this.repo.findById(id).exec();
    if (!doc) throw new NotFoundException('Программа не найдена');
    if (doc.status !== 'draft')
      throw new BadRequestException('Статус программы не черновик');

    await this.repo.findByIdAndDelete(doc._id.toString()).exec();
    await this.programsCache.invalidateLists();
    await this.programsCache.invalidateSuggest();
    return { deleted: true };
  }
}
