import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FindProgramsQueryDto {
  @ApiPropertyOptional({
    description: 'Статус программы',
    enum: ['draft', 'published'],
  })
  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';

  @ApiPropertyOptional({
    description: 'Лимит записей на страницу (1..100). По умолчанию 20.',
    minimum: 1,
    maximum: 100,
    default: 20,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    const MAX_LIMIT = 100;
    const n = Number(value);
    if (Number(isFinite(n))) {
      const int = Math.trunc(n);
      return Math.min(Math.max(int, 1), MAX_LIMIT);
    }
    return 20;
  })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Смещение (offset), не меньше 0. По умолчанию 0.',
    minimum: 0,
    default: 0,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Transform(({ value }) => {
    const n = Number(value);
    if (Number.isFinite(n)) {
      const int = Math.trunc(n);
      return Math.max(int, 0);
    }
    // значение по умолчанию
    return 0;
  })
  offset?: number;

  @ApiPropertyOptional({
    description:
      'Слаг категории. Если указан — будут выбраны программы из этой категории и всех её потомков.',
    type: String,
    example: 'programmirovanie',
  })
  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string' ? params.value.trim() : undefined,
  )
  categorySlug?: string;

  @ApiPropertyOptional({
    description:
      'Поисковая строка (ищет по названию и описанию, без учета регистра).',
    type: String,
    example: 'python',
  })
  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) => {
    if (typeof params.value !== 'string') return undefined;
    const normalized = params.value.trim().replace(/\s+/g, ' ').slice(0, 100);
    return normalized.length >= 2 ? normalized : undefined;
  })
  text?: string;

  @ApiPropertyOptional({
    description: 'Поле сортировки',
    enum: ['createdAt', 'views', 'hours'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsEnum(['createdAt', 'views', 'hours'])
  @Transform(({ value }) => {
    const allowed = ['createdAt', 'views', 'hours'] as const;
    const raw = typeof value === 'string' ? value.trim() : undefined;
    return (allowed as readonly string[]).includes(raw ?? '')
      ? (raw as 'createdAt' | 'views' | 'hours')
      : 'createdAt';
  })
  sort?: 'createdAt' | 'views' | 'hours';

  @ApiPropertyOptional({
    description: 'Направление сортировки',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsEnum(['asc', 'desc'])
  @Transform(({ value }) => {
    const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
    return v === 'asc' || v === 'desc' ? v : 'desc';
  })
  order?: 'asc' | 'desc';
}
