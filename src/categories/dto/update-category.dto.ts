import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  // Allow changing slug if needed
  @IsOptional()
  @IsString()
  @Matches(slugPattern, {
    message: 'Slug must be lowercase and contain only letters and numbers',
  })
  slug?: string;

  // Allow changing parent by slug
  @IsOptional()
  @IsString()
  @Matches(slugPattern, {
    message: 'Slug must be lowercase and contain only letters and numbers',
  })
  parentSlug?: string;
}
