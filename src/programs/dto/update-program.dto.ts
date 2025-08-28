import {
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';

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
  @IsEnum(['dpo', 'prof_training'])
  categoryType?: 'dpo' | 'prof_training';

  @IsOptional()
  @IsEnum(['pk', 'pp'])
  dpoSubcategory?: 'pk' | 'pp';

  @IsOptional()
  @IsString()
  @Transform((params: TransformFnParams) =>
    typeof params.value === 'string' ? params.value.trim() : undefined,
  )
  completionDocument?: string;
  categorySlug?: string;

  @IsOptional()
  @IsMongoId()
  categoryId?: string;
}
