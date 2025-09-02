import { ProgramResponseDto } from '../dto/program-response.dto';

export type AnyProgram = {
  _id: any;
  title?: string;
  categoryType?: 'dpo' | 'prof_training';
  dpoSubcategory?: 'pk' | 'pp';
  description?: string;
  category?: any;
  views: number;
  hours?: number;
  completionDocument?: string;
  slug?: string;
  status: 'draft' | 'published';
  createdAt?: Date | string;
  updatedAt?: Date | string;
  [key: string]: unknown;
};

export function mapProgram(src: AnyProgram): ProgramResponseDto {
  const id = typeof src._id === 'string' ? src._id : String(src._id);
  const category =
    src.category !== null
      ? typeof src.category === 'string'
        ? src.category
        : String(src.category)
      : undefined;

  const createdAt =
    src.createdAt instanceof Date
      ? src.createdAt
      : typeof src.createdAt === 'string'
        ? new Date(src.createdAt)
        : undefined;

  const updatedAt =
    src.updatedAt instanceof Date
      ? src.updatedAt
      : typeof src.updatedAt === 'string'
        ? new Date(src.updatedAt)
        : undefined;

  return {
    _id: id,
    title: src.title,
    categoryType: src.categoryType,
    dpoSubcategory: src.dpoSubcategory,
    description: src.description,
    category,
    views: src.views,
    hours: src.hours,
    completionDocument: src.completionDocument,
    slug: src.slug,
    status: src.status,
    createdAt,
    updatedAt,
  };
}

export function mapPrograms(list: AnyProgram[]): ProgramResponseDto[] {
  return list.map(mapProgram);
}
