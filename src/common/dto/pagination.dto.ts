import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({ description: 'Всего записей', example: 123 })
  total!: number;

  @ApiPropertyOptional({ description: 'Смещение', example: 0 })
  offset!: number;

  @ApiPropertyOptional({ description: 'Размер страницы', example: 20 })
  limit!: number;

  @ApiPropertyOptional({ description: 'Поле сортировки', example: 'createdAt' })
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Направление сортировки',
    example: -1,
    enum: [-1, 1],
  })
  sortDirection?: 1 | -1;

  @ApiPropertyOptional({ description: 'Применённые фильтры' })
  filters?: Record<string, unknown> | null;
}
