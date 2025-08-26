import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  Application,
  ApplicationDocument,
  ApplicationItem,
  StatusType,
} from './schemas/application.schema';
import { Model, Types } from 'mongoose';
import { Program, ProgramDocument } from '../programs/schemas/programSchema';
import { CreateApplicationDto } from './dto/create-application.dto';
import { canTransition } from './status.transitions';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  private addHours(date: Date, hours: number): Date {
    return new Date(date.getTime() + hours * 60 * 60 * 1000);
  }

  async create(dto: CreateApplicationDto) {
    if (!dto.items.length) {
      throw new BadRequestException('Items must not be empty');
    }
    const snilsDigits = this.onlyDigits(dto.snils);
    const innDigits = this.onlyDigits(dto.inn);

    const programIds = dto.items.map((it) => it.programId);
    const uniqueObjectIds = Array.from(new Set(programIds)).map(
      (id) => new Types.ObjectId(id),
    );

    const programs = await this.programModel
      .find(
        {
          _id: { $in: uniqueObjectIds },
        },
        { _id: 1, hours: 1, title: 1 },
      )
      .lean()
      .exec();

    const byId = new Map<string, { hours?: number; title?: string }>(
      programs.map((p) => [
        String(p._id),
        { hours: p.hours ?? 0, title: p.title },
      ]),
    );

    const notFound = Array.from(
      new Set(programIds.filter((id) => !byId.has(id))),
    );
    if (notFound.length) {
      throw new BadRequestException(
        `Programs with IDs ${notFound.join(', ')} not found`,
      );
    }

    const items: ApplicationItem[] = dto.items.map((i) => {
      const meta = byId.get(i.programId)!;
      const quantity = i.quantity ?? 1;

      const item: ApplicationItem = {
        program: new Types.ObjectId(i.programId),
        quantity,
        titleAtApplication: meta.title,
      } as ApplicationItem;

      if (i.startDate) {
        const start = new Date(i.startDate);
        item.startDate = start;

        if ((meta.hours ?? 0) > 0) {
          item.endDate = this.addHours(start, meta.hours!);
        }
      }
      return item;
    });
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

  private onlyDigits(value: string) {
    return value.replace(/\D+/g, '');
  }

  async updateStatus(applicationId: string, nextStatus: StatusType) {
    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const current: StatusType = app.status ?? StatusType.NEW;

    if (!canTransition(current, nextStatus))
      throw new BadRequestException(
        `Cannot transition from ${current} to ${nextStatus}`,
      );

    app.status = nextStatus;
    await app.save();
    return app.toObject();
  }
}
