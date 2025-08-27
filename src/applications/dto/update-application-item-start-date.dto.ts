import { IsDateString } from 'class-validator';

export class UpdateApplicationItemStartDateDto {
  @IsDateString()
  startDate: string;
}
