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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramItemDto {
  @ApiProperty({
    description: 'ID программы',
    example: '507f1f77bcf86cd799439011',
  })
  @IsMongoId()
  programId: string;

  @ApiPropertyOptional({
    description: 'Количество слушателей по программе',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({
    description: 'Дата начала по программе (ISO 8601)',
    example: '2025-12-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class CreateApplicationDto {
  @ApiProperty({
    description: 'Список программ в заявке',
    type: () => [ProgramItemDto],
    minItems: 1,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProgramItemDto)
  items: ProgramItemDto[];

  @ApiProperty({
    description: 'СНИЛС (11 цифр)',
    example: '12345678901',
    pattern: '^[0-9]{11}$',
  })
  @Matches(/^[0-9]{11}$/)
  snils: string;

  @ApiProperty({
    description: 'ИНН (10 или 12 цифр)',
    example: '1234567890',
    pattern: '^(?:\\d{10}|\\d{12})$',
  })
  @Matches(/^(?:\d{10}|\d{12})$/)
  inn: string;

  @ApiProperty({
    description: 'Название учебного заведения',
    minLength: 2,
    maxLength: 200,
    example: 'МГУ',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  institutionName: string;

  @ApiProperty({
    description: 'Дата окончания обучения (ISO 8601)',
    example: '2026-06-15T00:00:00.000Z',
  })
  @IsDateString()
  graduationDate: string;

  @ApiProperty({
    description: 'Тип образования',
    enum: EducationType,
  })
  @IsEnum(EducationType)
  educationType: EducationType;
}
