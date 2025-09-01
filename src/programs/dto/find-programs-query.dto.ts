import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';

export class FindProgramsQueryDto {
  @IsOptional()
  @IsEnum(['draft', 'published'])
  status?: 'draft' | 'published';

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  sortByViews?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string' ? params.value.trim() : undefined,
  )
  categorySlug?: string;

  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) => {
    if (typeof params.value !== 'string') return undefined;
    const trimmed = params.value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  })
  text?: string;
}
