import { StatusType } from '../schemas/application.schema';
import { IsEnum } from 'class-validator';

export class UpdateApplicationStatusDto {
  @IsEnum(StatusType)
  status: StatusType;
}
