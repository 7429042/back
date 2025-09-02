import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StatusType } from '../schemas/application.schema';
import type { PaginationDto } from '../../common/dto/pagination.dto';

export class ApplicationItemResponseDto {
  @ApiProperty({
    description: 'ID программы',
    example: '507f1f77bcf86cd799439011',
  })
  programId!: string;

  @ApiProperty({
    description: 'Название программы, зафиксированное на момент подачи заявки',
  })
  title!: string;

  @ApiProperty({
    description: 'Количество по программе',
    example: 1,
    default: 1,
  })
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Дата начала (ISO)',
    example: '2025-12-01T00:00:00.000Z',
    nullable: true,
  })
  startDate?: string | null;

  @ApiPropertyOptional({
    description: 'Дата окончания (ISO)',
    example: '2026-01-15T00:00:00.000Z',
    nullable: true,
  })
  endDate?: string | null;
}

export class ApplicationStatusHistoryItemDto {
  @ApiProperty({ enum: StatusType })
  from!: StatusType;

  @ApiProperty({ enum: StatusType })
  to!: StatusType;

  @ApiProperty({ description: 'Когда изменён статус (ISO)' })
  changedAt!: string;

  @ApiProperty({
    description: 'Кем изменён',
    example: '507f1f77bcf86cd799439012',
  })
  byUser!: string;

  @ApiPropertyOptional({
    description: 'Комментарий',
    maxLength: 1000,
    nullable: true,
  })
  comment?: string | null;
}

export class ApplicationResponseDto {
  @ApiProperty({ description: 'ID заявки' })
  id!: string;

  @ApiProperty({ description: 'Пользователь (ID)' })
  userId!: string;

  @ApiProperty({ type: () => [ApplicationItemResponseDto] })
  items!: ApplicationItemResponseDto[];

  @ApiProperty({ enum: StatusType })
  status!: StatusType;

  @ApiProperty({ description: 'Дата создания (ISO)' })
  createdAt!: string;

  @ApiProperty({ description: 'Дата обновления (ISO)' })
  updatedAt!: string;
}

export class ApplicationsListResponseDto {
  @ApiProperty({ type: () => [ApplicationResponseDto] })
  data!: ApplicationResponseDto[];

  @ApiProperty({ description: 'Метаданные пагинации' })
  meta!: PaginationDto;
}

export class StatusHistoryListResponseDto {
  @ApiProperty({ type: () => [ApplicationStatusHistoryItemDto] })
  data!: ApplicationStatusHistoryItemDto[];
}

export class UpdateStatusResponseDto {
  @ApiProperty({ description: 'ID заявки' })
  id!: string;

  @ApiProperty({ enum: StatusType })
  status!: StatusType;

  @ApiProperty({
    description: 'Разрешённые следующие статусы',
    isArray: true,
    enum: StatusType,
  })
  allowedNext!: StatusType[];

  @ApiPropertyOptional({
    description: 'Последнее изменение статуса',
    type: () => ApplicationStatusHistoryItemDto,
    nullable: true,
  })
  lastHistory?: ApplicationStatusHistoryItemDto | null;
}
