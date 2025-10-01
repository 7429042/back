import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  // Ensure base categories exist (idempotent)
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Post('ensure')
  ensure(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.ensure(dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Put(':slug')
  update(@Param('slug') slug: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.updateBySlug(slug, dto);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Delete(':slug')
  remove(@Param('slug') slug: string) {
    return this.categoriesService.deleteBySlug(slug);
  }

  @Get(':slug/ids')
  getIdsWithDescendants(@Param('slug') slug: string) {
    return this.categoriesService.collectCategoryAndDescendantsIdsBySlug(slug);
  }
}
