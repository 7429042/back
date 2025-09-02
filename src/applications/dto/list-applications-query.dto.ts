import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { StatusType } from '../schemas/application.schema';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({
    description: 'Смещение (offset) для пагинации',
    minimum: 0,
    example: 0,
    default: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Размер страницы (limit) для пагинации',
    minimum: 1,
    maximum: 100,
    example: 20,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Поле сортировки',
    enum: ['createdAt', 'updatedAt', 'status'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'status'])
  sortBy?: 'createdAt' | 'updatedAt' | 'status' = 'createdAt';

  @ApiPropertyOptional({
    description: 'Направление сортировки',
    enum: [-1, 1],
    default: -1,
    example: -1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([-1, 1] as const)
  sortDirection?: -1 | 1 = -1;

  @ApiPropertyOptional({
    description: 'Фильтр по статусу заявки',
    enum: StatusType,
  })
  @IsOptional()
  @IsEnum(StatusType)
  status?: StatusType;

  @ApiPropertyOptional({
    description: 'Фильтр по пользователю (ObjectId)',
    example: '507f1f77bcf86cd799439011',
  })
  @IsOptional()
  @IsMongoId()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Дата создания с (ISO 8601)',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({
    description: 'Дата создания по (ISO 8601)',
    example: '2025-12-31T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Подгружать данные пользователя',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  withUser?: boolean;

  @ApiPropertyOptional({
    description: 'Подгружать данные программ для элементов заявки',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  withProgram?: boolean;
}
