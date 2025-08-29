import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { FindProgramsQueryDto } from './dto/find-programs-query.dto';
import { CategoriesService } from '../categories/categories.service';
import { Types } from 'mongoose';
import { ParamIdDto } from '../common/dto/param-id.dto';
import { GetProgramQueryDto } from './dto/get-program-query.dto';
import { AdminGuard } from '../auth/admin.guard';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('programs')
export class ProgramsController {
  constructor(
    private readonly programsService: ProgramsService,
    private readonly categoriesService: CategoriesService,
  ) {}

  @UseGuards(JwtAuthGuard, AdminGuard)
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

  @Get(':id')
  async findOneById(
    @Param() params: ParamIdDto,
    @Query() query: GetProgramQueryDto,
  ) {
    const incrementView = query.incrementView ?? true;
    return this.programsService.findOneById(params.id, { incrementView });
  }

  @Get('slug/:slug')
  async findOneBySlug(
    @Param('slug') slug: string,
    @Query() query: GetProgramQueryDto,
  ) {
    const incrementView = query.incrementView ?? true;
    return this.programsService.findOneBySlug(slug, { incrementView });
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id')
  async updateDraft(
    @Param() params: ParamIdDto,
    @Body() dto: UpdateProgramDto,
  ) {
    let categoryId: Types.ObjectId | undefined;
    if (dto.categorySlug) {
      const ids =
        await this.categoriesService.collectCategoryAndDescendantsIdsBySlug(
          dto.categorySlug,
        );
      categoryId = ids[0];
    } else if (dto.categoryId) {
      categoryId = new Types.ObjectId(dto.categoryId);
    }
    return this.programsService.updateDraft(params.id, {
      title: dto.title,
      description: dto.description,
      hours: dto.hours,
      categoryType: dto.categoryType,
      dpoSubcategory: dto.dpoSubcategory,
      category: categoryId,
    });
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async publish(@Param() params: ParamIdDto) {
    return this.programsService.publish(params.id);
  }
}
