import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetUserApplicationQueryDto {
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
  limit?: number = 20;

  @IsOptional()
  @IsIn(['createdAt', 'updatedAt'])
  sortBy?: 'createdAt' | 'updatedAt' = 'createdAt';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([-1, 1] as const)
  sortDirection?: -1 | 1 = -1;
}
