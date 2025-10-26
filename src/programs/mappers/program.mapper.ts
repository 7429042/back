import { ProgramResponseDto } from '../dto/program-response.dto';
import { Types } from 'mongoose';

export type AnyProgram = {
  _id: Types.ObjectId | string;
  title?: string;
  description?: string;
  category?: Types.ObjectId | string;
  views: number;
  hours?: number;
  completionDocument?: string;
  slug?: string;
  status: 'draft' | 'published';
  createdAt?: Date | string;
  updatedAt?: Date | string;
  price?: number;
};

function toObjectIdString(
  value: Types.ObjectId | string | null | undefined,
): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.toString();
}

function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (value) return new Date(value);
  return undefined;
}

export function mapProgram(src: AnyProgram): ProgramResponseDto {
  return {
    _id: toObjectIdString(src._id) ?? '',
    title: src.title,
    description: src.description,
    category: toObjectIdString(src.category),
    views: src.views,
    hours: src.hours,
    completionDocument: src.completionDocument,
    slug: src.slug,
    status: src.status,
    createdAt: toDate(src.createdAt),
    updatedAt: toDate(src.updatedAt),
    price: src.price,
  };
}

export function mapPrograms(list: AnyProgram[]): ProgramResponseDto[] {
  return list.map(mapProgram);
}
