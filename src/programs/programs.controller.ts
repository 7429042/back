import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { AdminGuard } from '../auth/guards/admin.guard';
import { UpdateProgramDto } from './dto/update-program.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SuggestProgramsQueryDto } from './dto/suggest-programs-query.dto';
import { ApiOkResponse, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  ProgramResponseDto,
  ProgramsSearchResponseDto,
} from './dto/program-response.dto';
import {
  CurrentUser,
  CurrentUserPayload,
} from '../auth/decorators/current-user.decorator';

@ApiTags('Programs')
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
  @ApiOkResponse({
    description: 'Список программ',
    type: ProgramResponseDto,
    isArray: true,
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'published'],
    description: 'Статус программы',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Лимит (1..100), по умолчанию 20',
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Смещение (>=0), по умолчанию 0',
    example: 0,
  })
  @ApiQuery({
    name: 'categorySlug',
    required: false,
    type: String,
    description: 'Слаг категории для фильтрации (включая потомков)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['createdAt', 'views', 'hours'],
    description: 'Поле сортировки',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Направление сортировки',
    example: 'desc',
  })
  async findAll(
    @Query() query: FindProgramsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const isAdmin = user.role === 'admin';
    let categoryIds: Types.ObjectId[] | undefined = undefined;
    if (query.categorySlug) {
      categoryIds =
        await this.categoriesService.collectCategoryAndDescendantsIdsBySlug(
          query.categorySlug,
        );
    }
    return this.programsService.findAll({
      status: isAdmin ? query.status : 'published',
      limit: query.limit,
      offset: query.offset,
      categoryIds,
      sort: query.sort,
      order: query.order,
    });
  }

  @Get('search')
  @ApiOkResponse({
    description: 'Результаты поиска программ с пагинацией и метаданными',
    type: ProgramsSearchResponseDto,
  })
  @ApiQuery({
    name: 'text',
    required: false,
    type: String,
    description: 'Поисковая строка (2..100), AND по словам',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['draft', 'published'],
    description: 'Статус программы',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Лимит (1..100), по умолчанию 20',
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Смещение (>=0), по умолчанию 0',
    example: 0,
  })
  @ApiQuery({
    name: 'categorySlug',
    required: false,
    type: String,
    description: 'Слаг категории для фильтрации (включая потомков)',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['createdAt', 'views', 'hours'],
    description: 'Поле сортировки',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'order',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Направление сортировки',
    example: 'desc',
  })
  async search(
    @Query() query: FindProgramsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const isAdmin = user.role === 'admin';
    let categoryIds: Types.ObjectId[] | undefined = undefined;
    if (query.categorySlug) {
      categoryIds =
        await this.categoriesService.collectCategoryAndDescendantsIdsBySlug(
          query.categorySlug,
        );
    }

    const rawText: unknown = (query as Record<string, unknown>).text;
    const safeText: string | undefined =
      typeof rawText === 'string' ? rawText : undefined;

    return this.programsService.findAllWithMeta({
      status: isAdmin ? query.status : 'published',
      limit: query.limit,
      offset: query.offset,
      categoryIds,
      text: safeText,
      sort: query.sort,
      order: query.order,
    });
  }

  @Get('slug/:slug')
  async findOneBySlug(
    @Param('slug') slug: string,
    @Query() query: GetProgramQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const isAdmin = user.role === 'admin';
    const incrementView = query.incrementView ?? true;
    const res = await this.programsService.findOneBySlug(slug, {
      incrementView,
    });
    if (!isAdmin && res.status === 'draft') {
      throw new NotFoundException('Program not found');
    }
    return res;
  }

  @Get(':id')
  async findOneById(
    @Param() params: ParamIdDto,
    @Query() query: GetProgramQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const incrementView = query.incrementView ?? true;
    const isAdmin = user.role === 'admin';
    const res = await this.programsService.findOneById(params.id, {
      incrementView,
    });
    if (!isAdmin && res.status === 'draft') {
      throw new NotFoundException('Program not found');
    }
    return res;
  }

  @ApiOkResponse({
    description: 'Подсказки по началу названия программы',
    type: ProgramResponseDto,
    isArray: true,
  })
  @ApiQuery({
    name: 'q',
    required: false,
    type: String,
    description: 'Префикс названия (минимум 1 символ)',
    example: 'pro',
  })
  @ApiQuery({
    name: 'categorySlug',
    required: false,
    type: String,
    description: 'Слаг категории для фильтрации подсказок (включая потомков)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Лимит результатов (1..20), по умолчанию 10',
    example: 10,
  })
  @Get('suggest')
  async suggest(@Query() query: SuggestProgramsQueryDto) {
    let categoryIds: Types.ObjectId[] | undefined;
    if (query.categorySlug) {
      categoryIds =
        await this.categoriesService.collectCategoryAndDescendantsIdsBySlug(
          query.categorySlug,
        );
    }
    return this.programsService.suggest({
      q: query.q,
      limit: query.limit,
      categoryIds,
      status: 'published',
    });
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteDraft(@Param() params: ParamIdDto) {
    return this.programsService.deleteDraft(params.id);
  }
}
