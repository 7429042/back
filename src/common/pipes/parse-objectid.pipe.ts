import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { Types } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (!value) {
      throw new BadRequestException(
        `Параметр '${metadata.data}' не может быть пустым`,
      );
    }

    if (!Types.ObjectId.isValid(value)) {
      throw new BadRequestException(
        `Параметр '${metadata.data}' имеет неверный формат ObjectId: '${value}'`,
      );
    }

    return value;
  }
}
