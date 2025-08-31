import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
}
