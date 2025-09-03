import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramResponseDto {
  @ApiProperty({
    description: 'ID программы',
    example: '507f1f77bcf86cd799439011',
  })
  _id!: string;

  @ApiPropertyOptional({
    description: 'Название программы',
    example: 'Основы программирования',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'Тип категории',
    enum: ['dpo', 'prof_training'],
  })
  categoryType?: 'dpo' | 'prof_training';

  @ApiPropertyOptional({
    description: 'Подкатегория для DPO',
    enum: ['pk', 'pp'],
    nullable: true,
  })
  dpoSubcategory?: 'pk' | 'pp';

  @ApiPropertyOptional({ description: 'Описание программы', nullable: true })
  description?: string;

  @ApiPropertyOptional({
    description: 'ID категории',
    example: '507f1f77bcf86cd799439012',
    nullable: true,
  })
  category?: string;

  @ApiProperty({ description: 'Количество просмотров', example: 123 })
  views!: number;

  @ApiPropertyOptional({
    description: 'Количество академических часов',
    example: 72,
    nullable: true,
  })
  hours?: number;

  @ApiPropertyOptional({ description: 'Документ об окончании', nullable: true })
  completionDocument?: string;

  @ApiPropertyOptional({
    description: 'Слаг',
    example: 'osnovy-programmirovaniya',
    nullable: true,
  })
  slug?: string;

  @ApiProperty({
    description: 'Статус программы',
    enum: ['draft', 'published'],
  })
  status!: 'draft' | 'published';

  @ApiPropertyOptional({
    description: 'Создано',
    format: 'date-time',
    nullable: true,
  })
  createdAt?: Date;

  @ApiPropertyOptional({
    description: 'Обновлено',
    format: 'date-time',
    nullable: true,
  })
  updatedAt?: Date;
}

export class ProgramsSearchResponseDto {
  @ApiProperty({
    type: () => [ProgramResponseDto],
    description: 'Список программ',
  })
  items!: ProgramResponseDto[];

  @ApiProperty({ description: 'Всего найдено', example: 42 })
  total!: number;

  @ApiProperty({ description: 'Лимит на странице', example: 20 })
  limit!: number;

  @ApiProperty({ description: 'Смещение', example: 0 })
  offset!: number;
}
