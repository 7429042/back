import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SuggestProgramsQueryDto {
  @ApiPropertyOptional({
    description: 'Поисковая строка (префикс названия). Минимум 1 символ.',
    example: 'pro',
    minLength: 1,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Transform(({ value }) => {
    if (typeof value !== 'string') return undefined;
    const v = value.trim().toLowerCase().slice(0, 50);
    return v.length >= 1 ? v : undefined;
  })
  q?: string;

  @ApiPropertyOptional({
    description:
      'Слаг категории для фильтрации (включая потомков на бэке). Опционально.',
    example: 'programmirovanie',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : undefined,
  )
  categorySlug?: string;

  @ApiPropertyOptional({
    description: 'Лимит результатов (1..20). По умолчанию 10.',
    default: 10,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Transform(({ value }) => {
    const MAX_LIMIT = 20;
    const n = Number(value);
    if (Number.isFinite(n)) {
      const int = Math.trunc(n);
      return Math.min(Math.max(int, 1), MAX_LIMIT);
    }
    return 10;
  })
  limit?: number;

  @ApiPropertyOptional({
    description:
      'Статус программ. По умолчанию используется published (эндпоинт публичный).',
    enum: ['draft', 'published'],
    default: 'published',
  })
  @IsOptional()
  @IsEnum(['draft', 'published'])
  @Transform(({ value }) => {
    const v = typeof value === 'string' ? value.trim() : undefined;
    return v === 'draft' || v === 'published' ? v : 'published';
  })
  status?: 'draft' | 'published';
}
