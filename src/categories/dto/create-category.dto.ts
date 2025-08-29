import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class CreateCategoryDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @Matches(slugPattern, {
    message: 'Slug must be lowercase and contain only letters and numbers',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  @Matches(slugPattern, {
    message: 'Slug must be lowercase and contain only letters and numbers',
  })
  parentSlug?: string;
}
