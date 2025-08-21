import { Controller, Get, Post, Query } from '@nestjs/common';
import { ProgramsService } from './programs.service';

@Controller('programs')
export class ProgramsController {
  constructor(private readonly programsService: ProgramsService) {}

  @Post('draft')
  createDraft() {
    return this.programsService.createDraft();
  }

  @Get()
  findAll(
    @Query('status') status?: 'draft' | 'published',
    @Query('sortByViews') sortByViews?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.programsService.findAll({
      status,
      sortByViews: sortByViews === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }
}
