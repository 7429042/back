import { StatusType } from '../schemas/application.schema';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateApplicationStatusDto {
  @ApiProperty({
    description: 'Новый статус заявки',
    enum: StatusType,
  })
  @IsEnum(StatusType)
  status: StatusType;

  @ApiPropertyOptional({
    description: 'Комментарий администратора',
    maxLength: 1000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
