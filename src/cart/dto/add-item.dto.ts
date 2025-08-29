import { IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class AddItemDto {
  @IsMongoId()
  programId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;
}
