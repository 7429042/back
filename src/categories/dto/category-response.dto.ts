import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: '507f1f77bcf86cd799439011' })
  _id: string;

  @ApiProperty({ example: 'Сварщик' })
  name: string;

  @ApiProperty({ example: 'svarshchik' })
  slug: string;

  @ApiProperty({ example: 'professionalnoe-obuchenie/svarshchik' })
  path: string;

  @ApiProperty({
    example: '/uploads/categories/svarshchik/image.jpg',
    required: false,
  })
  imageUrl?: string;

  @ApiProperty({ example: 42 })
  views: number;
}

export class CategoryWithEditRouteDto extends CategoryResponseDto {
  @ApiProperty({ example: '/admin/categories/svarshchik/edit' })
  editRoute: string;
}

export class DeleteCategoryResponseDto {
  @ApiProperty({ example: true })
  deleted: boolean;
}

export class ImageUploadResponseDto {
  @ApiProperty({ example: '/uploads/categories/svarshchik/image.jpg' })
  imageUrl: string;
}

export class ImageDeleteResponseDto {
  @ApiProperty({ example: true })
  success: boolean;
}

export class ParentCounterDto {
  @ApiProperty({ example: 'professionalnoe-obuchenie' })
  slug: string;

  @ApiProperty({ example: 'Профессиональное обучение' })
  name: string;

  @ApiProperty({ example: 25 })
  count: number;
}
