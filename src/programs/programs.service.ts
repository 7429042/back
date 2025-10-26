import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { Program } from './schemas/programSchema';
import { ProgramResponseDto } from './dto/program-response.dto';
import { ProgramsReadService } from './services/programs.read.service';
import { ProgramsWriteService } from './services/programs.write.service';
import { ProgramsSuggestService } from './services/programs.suggest.service';

@Injectable()
export class ProgramsService {
  constructor(
    private readonly programsRead: ProgramsReadService,
    private readonly programsWrite: ProgramsWriteService,
    private readonly programsSuggest: ProgramsSuggestService,
  ) {}

  async createDraft(categoryId: Types.ObjectId): Promise<{ id: string }> {
    return this.programsWrite.createDraft(categoryId);
  }

  async updateDraft(
    id: string,
    updates: Partial<
      Pick<Program, 'title' | 'description' | 'hours' | 'category' | 'price'>
    >,
  ): Promise<ProgramResponseDto> {
    return this.programsWrite.updateDraft(id, updates);
  }

  async publish(id: string): Promise<ProgramResponseDto> {
    return this.programsWrite.publish(id);
  }

  async deleteDraft(id: string): Promise<{ deleted: true }> {
    return this.programsWrite.deleteDraft(id);
  }

  async findAll(params: {
    status?: 'draft' | 'published';
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
    sort?: 'createdAt' | 'views' | 'hours';
    order?: 'asc' | 'desc';
    text?: string;
  }): Promise<ProgramResponseDto[]> {
    return this.programsRead.findAll(params);
  }

  async findAllWithMeta(params: {
    status?: 'draft' | 'published';
    limit?: number;
    offset?: number;
    categoryIds?: Types.ObjectId[];
    text?: string;
    sort?: 'createdAt' | 'views' | 'hours';
    order?: 'asc' | 'desc';
  }): Promise<{
    items: ProgramResponseDto[];
    total: number;
    limit: number;
    offset: number;
  }> {
    return this.programsRead.findAllWithMeta(params);
  }

  async findOneById(
    id: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    return this.programsRead.findOneById(id, options);
  }

  async findOneBySlug(
    slug: string,
    options?: { incrementView?: boolean },
  ): Promise<ProgramResponseDto> {
    return this.programsRead.findOneBySlug(slug, options);
  }

  async suggest(params: {
    q?: string;
    limit?: number;
    categoryIds?: Types.ObjectId[];
    status?: 'draft' | 'published';
  }): Promise<ProgramResponseDto[]> {
    return this.programsSuggest.suggest(params);
  }
}
