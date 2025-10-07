import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
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
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { categoriesMulterOptions } from '../common/config/multer.config';

@ApiTags('Categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'Список категорий (плоский)' })
  findAll() {
    return this.categoriesService.findAll();
  }

  @Get('tree')
  @ApiOperation({ summary: 'Дерево категорий' })
  getTree() {
    return this.categoriesService.getTree();
  }

  @Get('search')
  @ApiOperation({ summary: 'Поиск категорий' })
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
  search(@Query() query: SearchCategoriesQueryDto) {
    return this.categoriesService.search(query.q, query.limit);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Создать категорию' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      root: {
        description: 'Корневая категория',
        value: { name: 'Programming', slug: 'programming' },
      },
      child: {
        description: 'Дочерняя категория',
        value: { name: 'JavaScript', parentSlug: 'programming' },
      },
    },
  })
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  // Ensure base categories exist (idempotent)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post('ensure')
  @ApiOperation({ summary: 'Идемпотентно создать категорию (если нет)' })
  @ApiBody({
    type: CreateCategoryDto,
    examples: {
      root: {
        description: 'Создать, если не существует (корень)',
        value: { name: 'Design', slug: 'design' },
      },
      child: {
        description: 'Создать, если не существует (дочерняя)',
        value: { name: 'UX', parentSlug: 'design' },
      },
    },
  })
  ensure(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.ensure(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Put(':slug')
  @ApiOperation({ summary: 'Обновить категорию по слагу' })
  @ApiParam({ name: 'slug' })
  @ApiBody({
    type: UpdateCategoryDto,
    examples: {
      rename: { description: 'Переименовать', value: { name: 'Frontend' } },
      reslug: { description: 'Изменить slug', value: { slug: 'frontend' } },
      reparent: {
        description: 'Переместить под другого родителя',
        value: { parentSlug: 'programming' },
      },
    },
  })
  update(@Param('slug') slug: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateBySlug(slug, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Delete(':slug')
  @ApiOperation({ summary: 'Удалить категорию и её поддерево по слагу' })
  @ApiParam({ name: 'slug' })
  remove(@Param('slug') slug: string) {
    return this.categoriesService.deleteBySlug(slug);
  }

  @Get(':slug/breadcrumbs')
  @ApiOperation({ summary: 'Хлебные крошки для категории' })
  @ApiParam({ name: 'slug' })
  getBreadcrumbs(@Param('slug') slug: string) {
    return this.categoriesService.getBreadcrumbs(slug);
  }

  @Get(':slug/ids')
  @ApiOperation({ summary: 'ID категории и всех её потомков' })
  @ApiParam({ name: 'slug' })
  getIdsWithDescendants(@Param('slug') slug: string) {
    return this.categoriesService.collectCategoryAndDescendantsIdsBySlug(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Получить категорию по слагу' })
  @ApiParam({ name: 'slug' })
  getBySlug(@Param('slug') slug: string) {
    return this.categoriesService.findBySlug(slug);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Post(':slug/image')
  @ApiOperation({ summary: 'Загрузить изображение категории' })
  @ApiParam({ name: 'slug' })
  @ApiConsumes('multipart/form-data')
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
  ) {
    if (!file) throw new BadRequestException('Файл не загружен');
    return this.categoriesService.setImage(slug, file.filename);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  @Delete(':slug/image')
  @ApiOperation({ summary: 'Удалить изображение категории' })
  @ApiParam({ name: 'slug' })
  async deleteImage(@Param('slug') slug: string) {
    return this.categoriesService.clearImage(slug);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Получить категорию по слагу учитывая просмотр' })
  @ApiParam({ name: 'slug' })
  async visit(@Param('slug') slug: string) {
    return this.categoriesService.incrementViews(slug);
  }
}
