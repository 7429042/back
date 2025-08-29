import { IsInt, Min } from 'class-validator';

export class SetQuantityDto {
  @IsInt()
  @Min(1)
  quantity: number;
}
