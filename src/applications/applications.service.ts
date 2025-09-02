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
import { canTransition, STATUS_TRANSITIONS } from './status.transitions';
import { GetUserApplicationQueryDto } from './dto/get-user-application-query.dto';
import { ConfigService } from '@nestjs/config';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import {
  addDays,
  calculateStudyDays,
  onlyDigits,
} from '../common/utils/helpers';
import { ensureValidObjectId } from '../common/mongo/object-id.util';

@Injectable()
export class ApplicationsService {
  private readonly hoursPerDay: number;
  constructor(
    @InjectModel(Application.name)
    private readonly applicationModel: Model<ApplicationDocument>,
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
    private readonly configService: ConfigService,
  ) {
    const cfg = this.configService.get<number>('HOURS_PER_DAY', 8);
    const normalized = Number.isFinite(cfg) ? Math.floor(cfg) : 8;
    this.hoursPerDay = normalized > 0 ? normalized : 8;
  }

  private normalizeSort(
    sortByInput: unknown,
    sortDirectionInput: unknown,
    allowedFields: readonly string[],
  ): { sortBy: string; sortDirection: 1 | -1 } {
    const defaultField = 'createdAt';
    const sortBy =
      typeof sortByInput === 'string' && allowedFields.includes(sortByInput)
        ? sortByInput
        : defaultField;

    const dirNum =
      typeof sortDirectionInput === 'number' &&
      (sortDirectionInput === 1 || sortDirectionInput === -1)
        ? sortDirectionInput
        : -1;

    return { sortBy, sortDirection: dirNum };
  }

  private ensureApplicationEditable(app: Application) {
    const status = app.status ?? StatusType.NEW;
    if (status === StatusType.APPROVED || status === StatusType.REJECTED) {
      throw new BadRequestException(
        `Cannot edit application in status ${status}`,
      );
    }
  }

  private studyDaysByHours(hours: number): number {
    return calculateStudyDays(hours, this.hoursPerDay);
  }

  async create(dto: CreateApplicationDto, userId: string) {
    if (!dto.items.length) {
      throw new BadRequestException('Items must not be empty');
    }
    ensureValidObjectId(userId, 'userId');

    const snilsDigits = onlyDigits(dto.snils);
    const innDigits = onlyDigits(dto.inn);

    // Агрегируем элементы по programId: суммируем quantity, выбираем самую раннюю валидную startDate
    const aggregatedMap: Map<string, { quantity: number; startDate?: string }> =
      new Map();

    for (const it of dto.items) {
      const q = it.quantity ?? 1;
      const prev = aggregatedMap.get(it.programId) ?? { quantity: 0 };
      const nextQuantity = (prev.quantity ?? 0) + q;

      let nextStart: string | undefined = prev.startDate;
      if (it.startDate) {
        const isValid = !isNaN(new Date(it.startDate).getTime());
        if (isValid) {
          if (!nextStart) {
            nextStart = it.startDate;
          } else if (
            new Date(it.startDate).getTime() < new Date(nextStart).getTime()
          ) {
            nextStart = it.startDate;
          }
        }
      }

      aggregatedMap.set(it.programId, {
        quantity: nextQuantity,
        startDate: nextStart,
      });
    }

    // Преобразуем Map в массив с явной типизацией
    const aggregatedItems: Array<{
      programId: string;
      quantity: number;
      startDate?: string;
    }> = [];
    for (const [programId, v] of aggregatedMap) {
      aggregatedItems.push({
        programId,
        quantity: v.quantity,
        startDate: v.startDate,
      });
    }

    // Используем агрегированный список для дальнейшей валидации/запросов
    const programIds = aggregatedItems.map((it) => it.programId);

    const invalidProgramIds = Array.from(
      new Set(programIds.filter((id) => !Types.ObjectId.isValid(id))),
    );

    if (invalidProgramIds.length) {
      throw new BadRequestException(
        `Invalid program IDs: ${invalidProgramIds.join(', ')}`,
      );
    }

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

    const now = new Date();

    // Формируем элементы заявки из агрегированного списка
    const items: ApplicationItem[] = aggregatedItems.map((i) => {
      const meta = byId.get(i.programId)!;
      const quantity = i.quantity ?? 1;

      const item: ApplicationItem = {
        program: new Types.ObjectId(i.programId),
        quantity,
        titleAtApplication: meta.title,
      } as ApplicationItem;

      const programHours = meta.hours ?? 0;
      const days = this.studyDaysByHours(programHours);

      if (i.startDate) {
        const start = new Date(i.startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestException('Invalid start date');
        }
        const minStart = now.getTime();
        if (start.getTime() < minStart) {
          throw new BadRequestException('Start date must be in the future');
        }
        item.startDate = start;
        if (days > 0) {
          item.endDate = addDays(start, days);
        }
      } else if (days > 0) {
        item.endDate = addDays(now, days);
      }
      return item;
    });

    return await this.applicationModel.create({
      user: new Types.ObjectId(userId),
      items,
      snils: snilsDigits,
      inn: innDigits,
      institutionName: dto.institutionName.trim(),
      graduationDate: new Date(dto.graduationDate),
      educationType: dto.educationType,
    });
  }

  async findByUser(userId: string, query: GetUserApplicationQueryDto) {
    ensureValidObjectId(userId, 'userId');
    const userObjectId = new Types.ObjectId(userId);
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 20;
    const { sortBy, sortDirection } = this.normalizeSort(
      query?.sortBy,
      query?.sortDirection,
      ['createdAt', 'updatedAt'],
    );

    const [items, total] = await Promise.all([
      this.applicationModel
        .find({ user: userObjectId })
        .sort({ [sortBy]: sortDirection })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.applicationModel.countDocuments({ user: userObjectId }).exec(),
    ]);
    return {
      data: items,
      meta: {
        total,
        offset,
        limit,
        sortBy,
        sortDirection,
      },
    };
  }

  async findOneById(applicationId: string, withProgram = false) {
    ensureValidObjectId(applicationId, 'applicationId');
    const query = this.applicationModel.findById(applicationId);
    if (withProgram) {
      query.populate({
        path: 'items.program',
        select: { title: 1, hours: 1 },
      });
    }
    const app = await query.lean().exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }
    return app;
  }

  async updateStatus(
    applicationId: string,
    nextStatus: StatusType,
    byUserId: string,
    comment?: string,
  ) {
    ensureValidObjectId(applicationId, 'applicationId');
    ensureValidObjectId(byUserId, 'byUserId');
    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const current: StatusType = app.status ?? StatusType.NEW;

    if (current === nextStatus) {
      const allowedNextSame = STATUS_TRANSITIONS[current] ?? [];
      return {
        id: String(app._id),
        status: app.status,
        allowedNext: allowedNextSame,
      };
    }

    if (!canTransition(current, nextStatus))
      throw new BadRequestException(
        `Cannot transition from ${current} to ${nextStatus}`,
      );

    app.status = nextStatus;

    const historyItem = {
      from: current,
      to: nextStatus,
      changedAt: new Date(),
      byUser: new Types.ObjectId(byUserId),
      comment,
    };

    if (!Array.isArray(app.statusHistory)) app.statusHistory = [];
    app.statusHistory.push(historyItem);

    await app.save();

    const allowedNext = STATUS_TRANSITIONS[app.status] ?? [];
    const lastHistory = app.statusHistory?.[app.statusHistory.length - 1];
    return {
      id: String(app._id),
      status: app.status,
      allowedNext,
      lastHistory,
    };
  }

  async updateItemStartDate(
    applicationId: string,
    itemId: string,
    startDateIso: string,
  ) {
    ensureValidObjectId(applicationId, 'applicationId');
    ensureValidObjectId(itemId, 'itemId');
    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    this.ensureApplicationEditable(app);

    const idx = app.items.findIndex((it) => String(it?._id) === itemId);
    if (idx === -1) {
      throw new BadRequestException('Item not found');
    }

    const item = app.items[idx];

    const startDate = new Date(startDateIso);

    if (isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid start date');
    }

    const now = new Date();
    if (startDate.getTime() < now.getTime()) {
      throw new BadRequestException('Start date must be in the future');
    }

    const programId = item.program as unknown as Types.ObjectId;
    const program = await this.programModel
      .findById(programId, { hours: 1 })
      .lean()
      .exec();

    if (!program) {
      throw new BadRequestException('Program not found');
    }

    const days = this.studyDaysByHours(program.hours ?? 0);
    item.startDate = startDate;
    if (days > 0) {
      item.endDate = addDays(startDate, days);
    } else {
      item.endDate = undefined;
    }
    await app.save();
    return app.toObject();
  }

  async updateItemStartDateAdmin(
    applicationId: string,
    itemId: string,
    startDateIso: string,
  ) {
    ensureValidObjectId(applicationId, 'applicationId');
    ensureValidObjectId(itemId, 'itemId');

    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    this.ensureApplicationEditable(app);

    const idx = app.items.findIndex((it) => String(it?._id) === itemId);
    if (idx === -1) {
      throw new BadRequestException('Item not found');
    }

    const item = app.items[idx];
    const startDate = new Date(startDateIso);

    if (isNaN(startDate.getTime())) {
      throw new BadRequestException('Invalid start date');
    }

    const programId = item.program as unknown as Types.ObjectId;
    const program = await this.programModel
      .findById(programId, { hours: 1 })
      .lean()
      .exec();

    if (!program) {
      throw new BadRequestException('Program not found');
    }

    const days = this.studyDaysByHours(program.hours ?? 0);
    item.startDate = startDate;
    if (days > 0) {
      item.endDate = addDays(startDate, days);
    } else {
      item.endDate = undefined;
    }
    await app.save();
    return app.toObject();
  }

  async clearItemDates(applicationId: string, itemId: string) {
    ensureValidObjectId(applicationId, 'applicationId');
    ensureValidObjectId(itemId, 'itemId');
    const app = await this.applicationModel.findById(applicationId).exec();
    if (!app) {
      throw new NotFoundException('Application not found');
    }

    this.ensureApplicationEditable(app);

    const idx = app.items.findIndex((it) => String(it?._id) === itemId);
    if (idx === -1) {
      throw new BadRequestException('Item not found');
    }

    app.items[idx].startDate = undefined;
    app.items[idx].endDate = undefined;
    await app.save();
    return app.toObject();
  }

  async findStatusHistory(applicationId: string) {
    ensureValidObjectId(applicationId, 'applicationId');
    const app = await this.applicationModel
      .findById(applicationId)
      .select({ statusHistory: 1 })
      .lean()
      .exec();

    if (!app) {
      throw new NotFoundException('Application not found');
    }

    const history = Array.isArray(app.statusHistory) ? app.statusHistory : [];
    history.sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime(),
    );
    return { data: history };
  }

  async adminList(query: ListApplicationsQueryDto) {
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 20;
    const { sortBy, sortDirection } = this.normalizeSort(
      query?.sortBy,
      query?.sortDirection,
      ['createdAt', 'updatedAt', 'status'],
    );

    const where: Record<string, unknown> = {};
    if (query.status) where.status = query.status;
    if (query.userId) {
      ensureValidObjectId(query.userId, 'userId');
      where.user = new Types.ObjectId(query.userId);
    }

    if (query.dateFrom || query.dateTo) {
      const createdAt: Record<string, Date> = {};
      if (query.dateFrom) createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) createdAt.$lte = new Date(query.dateTo);

      if (query.dateFrom && query.dateTo) {
        const from = new Date(query.dateFrom);
        const to = new Date(query.dateTo);
        if (from.getTime() > to.getTime()) {
          throw new BadRequestException('Invalid date range');
        }
      }
      where.createdAt = createdAt;
    }

    const cursor = this.applicationModel
      .find(where)
      .sort({ [sortBy]: sortDirection })
      .skip(offset)
      .limit(limit);

    if (query.withUser) {
      cursor.populate({
        path: 'user',
        select: {
          email: 1,
        },
      });
    }

    if (query.withProgram) {
      cursor.populate({
        path: 'items.program',
        select: {
          title: 1,
          hours: 1,
        },
      });
    }

    const [items, total] = await Promise.all([
      cursor.lean().exec(),
      this.applicationModel.countDocuments(where).exec(),
    ]);

    return {
      data: items,
      meta: {
        total,
        offset,
        limit,
        sortBy,
        sortDirection,
        filters: {
          status: query.status ?? null,
          userId: query.userId ?? null,
          dateFrom: query.dateFrom ?? null,
          dateTo: query.dateTo ?? null,
          withUser: !!query.withUser,
          withProgram: !!query.withProgram,
        },
      },
    };
  }
}
