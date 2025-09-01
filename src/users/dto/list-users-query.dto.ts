import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role } from '../schemas/userSchema';

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'email'])
  sortBy?: 'createdAt' | 'updatedAt' | 'email' = 'createdAt';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, -1] as const)
  sortDirection?: 1 | -1 = -1;

  @IsOptional()
  @IsEnum(Role)
  role?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(2)
  q?: string;
}
