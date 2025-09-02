import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

// ... existing code ...
export class UpdateApplicationItemStartDateDto {
  @ApiProperty({
    description: 'Дата начала элемента заявки (ISO 8601)',
    example: '2025-12-01T00:00:00.000Z',
  })
  @IsDateString()
  startDate: string;
}
