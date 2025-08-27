import { IsMongoId } from 'class-validator';

export class ParamIdDto {
  @IsMongoId()
  id!: string;
}