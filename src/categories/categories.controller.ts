import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  CategoriesService,
  CategoryLean,
  CategorySearchResult,
} from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { SearchCategoriesQueryDto } from './dto/search-categories-query.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiQuery,
  ApiConsumes,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { categoriesMulterOptions } from '../common/config/multer.config';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Список категорий (плоский список дочерних)' })
  @ApiOkResponse({ description: 'Список всех категорий' })
  async findAll(): Promise<CategoryLean[]> {
    return this.categoriesService.findAll();
  }

  @Get('search')
  @ApiOperation({ summary: 'Поиск категорий по name/slug' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Строка поиска по name/slug',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
    description: 'Макс. количество результатов (по умолчанию 20)',
  })
  @ApiOkResponse({ description: 'Результаты поиска' })
  async search(
    @Query() query: SearchCategoriesQueryDto,
  ): Promise<CategorySearchResult[]> {
    return this.categoriesService.search(query.q, query.limit);
  }

  @Get('parent-counters')
  @ApiOperation({ summary: 'Счётчики дочерних категорий по 3 родителям' })
  @ApiOkResponse({ description: 'Счётчики для родительских категорий' })
  async getParentCounters(): Promise<
    { slug: string; name: string; count: number }[]
  > {
    return this.categoriesService.getParentsCounters();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Создать дочернюю категорию (parentSlug обязателен)',
  })
  @ApiCreatedResponse({ description: 'Категория успешно создана' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      childPO: {
        description: 'Дочерняя под «Профессиональное обучение»',
        value: { name: 'Сварщик', parentSlug: 'professionalnoe-obuchenie' },
      },
      childPP: {
        description: 'Дочерняя под «Профессиональная переподготовка»',
        value: {
          name: 'Бухгалтер',
          parentSlug: 'professionalnaya-perepodgotovka',
        },
      },
      childPK: {
        description: 'Дочерняя под «Повышение квалификации»',
        value: {
          name: '1С для бухгалтеров',
          parentSlug: 'povyshenie-kvalifikacii',
        },
      },
    },
  })
  async create(@Body() dto: CreateCategoryDto) {
    const created = await this.categoriesService.create(dto);
    return {
      ...(created.toObject?.() ?? created),
      editRoute: `/admin/categories/${created.slug}/edit`,
    };
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('ensure')
  @ApiOperation({
    summary: 'Идемпотентно создать дочернюю категорию (если нет)',
  })
  @ApiOkResponse({ description: 'Категория создана или уже существует' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      childPO: {
        description:
          'Создать, если не существует (под «Профессиональное обучение»)',
        value: { name: 'Плотник', parentSlug: 'professionalnoe-obuchenie' },
      },
    },
  })
  async ensure(@Body() dto: CreateCategoryDto): Promise<CategoryLean> {
    return this.categoriesService.ensure(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Put(':slug')
  @ApiOperation({ summary: 'Обновить категорию по слагу' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Категория успешно обновлена' })
  @ApiBody({
    type: UpdateCategoryDto,
    examples: {
      rename: { description: 'Переименовать', value: { name: 'Frontend' } },
      reslug: { description: 'Изменить slug', value: { slug: 'frontend' } },
      reparent: {
        description: 'Переместить под одного из 3 фиксированных родителей',
        value: { parentSlug: 'povyshenie-kvalifikacii' },
      },
    },
  })
  async update(
    @Param('slug') slug: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryLean> {
    return this.categoriesService.updateBySlug(slug, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Delete(':slug')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Удалить категорию и её поддерево по слагу' })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  @ApiOkResponse({ description: 'Категория успешно удалена' })
  async remove(@Param('slug') slug: string): Promise<{ deleted: boolean }> {
    return this.categoriesService.deleteBySlug(slug);
  }

  @Get(':slug/ids')
  @ApiOperation({ summary: 'ID категории и всех её потомков' })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  async getIdsWithDescendants(@Param('slug') slug: string) {
    return this.categoriesService.collectCategoryAndDescendantsIds(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Получить категорию по слагу' })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  @ApiOkResponse({ description: 'Категория найдена' })
  async getBySlug(@Param('slug') slug: string): Promise<CategoryLean> {
    return this.categoriesService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post(':slug/image')
  @ApiOperation({ summary: 'Загрузить изображение категории' })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  @ApiConsumes('multipart/form-data')
  @ApiOkResponse({ description: 'Изображение успешно загружено' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        image: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('image', categoriesMulterOptions))
  async uploadImage(
    @Param('slug') slug: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ imageUrl: string }> {
    if (!file) throw new BadRequestException('Файл не загружен');
    return this.categoriesService.setImage(slug, file.filename);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Delete(':slug/image')
  @ApiOperation({ summary: 'Удалить изображение категории' })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  @ApiOkResponse({ description: 'Изображение успешно удалено' })
  async deleteImage(
    @Param('slug') slug: string,
  ): Promise<{ success: boolean }> {
    return this.categoriesService.clearImage(slug);
  }

  @Patch(':slug/views')
  @ApiOperation({
    summary: 'Увеличить просмотры и вернуть обновлённую категорию',
  })
  @ApiParam({ name: 'slug', example: 'svarshchik' })
  @ApiOkResponse({ description: 'Просмотры успешно увеличены' })
  async visit(@Param('slug') slug: string): Promise<CategoryLean> {
    return this.categoriesService.incrementViews(slug);
  }
}
