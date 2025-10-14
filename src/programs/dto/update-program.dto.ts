import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateProgramDto {
  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string' ? params.value.trim() : undefined,
  )
  title?: string;

  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string' ? params.value.trim() : undefined,
  )
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  hours?: number;

  @IsOptional()
  @IsString()
  @Matches(slugPattern, {
    message: 'Slug must be lowercase and contain only letters and numbers',
  })
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string'
      ? params.value.trim().toLowerCase()
      : undefined,
  )
  categorySlug?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;

  @IsOptional()
  @IsInt()
  price?: number;
}
