import { Types } from 'mongoose';
import { BadRequestException } from '@nestjs/common';

export function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id);
}

export function ensureValidObjectId(id: string, fieldName: string): void {
  if (!isValidObjectId(id)) {
    throw new BadRequestException(`${fieldName} must be a valid ObjectId`);
  }
}
