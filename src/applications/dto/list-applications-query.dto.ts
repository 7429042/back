import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { StatusType } from '../schemas/application.schema';

export class ListApplicationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  sortBy?: 'createdAt' | 'updatedAt' = 'createdAt';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([-1, 1] as const)
  sortDirection?: -1 | 1 = -1;

  @IsOptional()
  @IsEnum(StatusType)
  status?: StatusType;

  @IsOptional()
  @IsMongoId()
  userId?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  withUser?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  withProgram?: boolean;
}
