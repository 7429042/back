import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { EducationType } from '../schemas/application.schema';
import { Type } from 'class-transformer';

export class ProgramItemDto {
  @IsMongoId()
  programId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class CreateApplicationDto {
  @IsMongoId()
  userId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProgramItemDto)
  items: ProgramItemDto[];

  @Matches(/^[0-9]{11}$/)
  snils: string;

  @Matches(/^(?:\d{10}|\d{12})$/)
  inn: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  institutionName: string;

  @IsDateString()
  graduationDate: string;

  @IsEnum(EducationType)
  educationType: EducationType;
}
