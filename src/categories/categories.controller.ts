import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto)
  }

  @Get(':slug/ids')
  getIdsWithDescendants(@Param('slug') slug: string) {
    return this.categoriesService.collectCategoryAndDescendantsIdsBySlug(slug)
  }
}
