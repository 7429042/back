export class CreateCategoryDto {
  name: string;
  slug: string;
  parentSlug?: string;
}