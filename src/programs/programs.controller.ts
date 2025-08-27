import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { FindProgramsQueryDto } from './dto/find-programs-query.dto';
import { CategoriesService } from '../categories/categories.service';
import { Types } from 'mongoose';
import { ParamIdDto } from '../common/dto/param-id.dto';
import { GetProgramQueryDto } from './dto/get-program-query.dto';

@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @Post('draft')
  createDraft() {
    return this.programsService.createDraft();
  }

  @Get()
  async findAll(@Query() query: FindProgramsQueryDto) {
    let categoryIds: Types.ObjectId[] | undefined = undefined;
    if (query.categorySlug) {
      categoryIds =
        await this.categoriesService.collectCategoryAndDescendantsIdsBySlug(
          query.categorySlug,
        );
    }
    return this.programsService.findAll({
      status: query.status,
      sortByViews: query.sortByViews,
      limit: query.limit,
      offset: query.offset,
      categoryIds,
    });
  }

  async findById(
    @Param() params: ParamIdDto,
    @Query() query: GetProgramQueryDto,
  ) {
    const incrementView = query.incrementView ?? true;
    return this.programsService.findById(params.id, { incrementView });
  }
}
