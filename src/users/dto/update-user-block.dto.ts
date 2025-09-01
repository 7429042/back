import { IsBoolean } from 'class-validator';

export class UpdateUserBlockDto {
  @IsBoolean()
  isBlocked: boolean;
}
