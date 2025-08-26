import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Application,
  ApplicationDocument,
  ApplicationItem,
} from './schemas/application.schema';
import { Model, Types } from 'mongoose';
import { Program, ProgramDocument } from '../programs/schemas/programSchema';
import {
  CreateApplicationDto,
  ProgramItemDto,
} from './dto/create-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  private onlyDigits(value: string) {
    return value.replace(/\D+/g, '');
  }

  private mergeItems(items: ProgramItemDto[]): Map<string, number> {
    const map = new Map<string, number>();
    for (const it of items) {
      const id = it.programId;
      const qty = it.quantity ?? 1;
      map.set(id, (map.get(id) ?? 0) + qty);
    }
    return map;
  }

  async create(dto: CreateApplicationDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Items must not be empty');
    }
    const snilsDigits = this.onlyDigits(dto.snils);
    const innDigits = this.onlyDigits(dto.inn);

    const aggregated = this.mergeItems(dto.items);
    const uniqueProgramIds = [...aggregated.keys()];

    const programObjectIds = uniqueProgramIds.map(
      (id) => new Types.ObjectId(id),
    );
    const foundCount = await this.programModel.countDocuments({
      _id: { $in: programObjectIds },
    });
    if (foundCount !== uniqueProgramIds.length) {
      throw new BadRequestException(`One or more programs not found`);
    }

    const items: ApplicationItem[] = uniqueProgramIds.map((id) => ({
      program: new Types.ObjectId(id),
      quantity: aggregated.get(id)!,
    }));

    return await this.applicationModel.create({
      user: new Types.ObjectId(dto.userId),
      items,
      snils: snilsDigits,
      inn: innDigits,
      institutionName: dto.institutionName.trim(),
      graduationDate: new Date(dto.graduationDate),
      educationType: dto.educationType,
    });
  }
  async findByUser(userId: string) {
    return this.applicationModel
      .find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
  }
}
