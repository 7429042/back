import { StatusType } from '../schemas/application.schema';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(StatusType)
  status: StatusType;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
