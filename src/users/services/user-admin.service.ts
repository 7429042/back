import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role, User, UserDocument } from '../schemas/userSchema';
import { Model, Types } from 'mongoose';
import { AuthService } from '../../auth/auth.service';
import { UserCacheService } from './user-cache.service';
import { AuditEvent, AuditService } from '../../auth/services/audit.service';
import { AuthUtilsService } from '../../auth/services/auth-utils';
import { UpdateUserDto } from '../dto/update-user.dto';
import { AdminCreateUserDto } from '../dto/admin-create-user.dto';
import * as bcrypt from 'bcrypt';
import { UpdateUserBlockDto } from '../dto/update-user-block.dto';

@Injectable()
export class UserAdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly cacheService: UserCacheService,
    private readonly audit: AuditService,
    private readonly utils: AuthUtilsService,
  ) {}

  private async ensureNotLastAdminForRoleChange(
    targetUserId: Types.ObjectId,
    nextRole?: Role,
  ) {
    if (!nextRole || nextRole === Role.ADMIN) return;

    // Находим целевого пользователя
    const target = await this.userModel.findById(targetUserId).lean().exec();
    if (!target) {
      throw new BadRequestException('Пользователь не найден');
    }

    // Если целевой пользователь не админ, изменение роли безопасно
    if (target.role !== Role.ADMIN) {
      return;
    }

    // Если целевой пользователь админ, проверяем количество админов
    const adminCount = await this.userModel.countDocuments({
      role: Role.ADMIN,
    });

    // Если это последний админ, запрещаем изменение роли
    if (adminCount <= 1) {
      throw new BadRequestException('Нельзя удалить последнего администратора');
    }
  }

  private async ensureNotLastAdminForDeletion(targetUserId: Types.ObjectId) {
    const user = await this.userModel.findById(targetUserId).lean().exec();
    if (user?.role !== Role.ADMIN) return;
    const adminCount = await this.userModel.countDocuments({
      role: Role.ADMIN,
    });
    if (adminCount <= 1) {
      throw new BadRequestException('Нельзя удалить последнего администратора');
    }
  }

  async updateByAdmin(id: string, dto: UpdateUserDto) {
    const _id = new Types.ObjectId(id);
    await this.ensureNotLastAdminForRoleChange(_id, dto.role);

    const oldUser = await this.userModel.findById(_id).lean().exec();
    if (!oldUser) {
      throw new BadRequestException('Пользователь не найден');
    }

    const update: Partial<User> = {};
    if (dto.firstName !== undefined) update.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) update.lastName = dto.lastName.trim();
    if (dto.role !== undefined) update.role = dto.role;

    const updated = await this.userModel
      .findByIdAndUpdate(_id, update, {
        new: true,
      })
      .select('-passwordHash')
      .lean()
      .exec();

    if (!updated) {
      throw new BadRequestException('Пользователь не найден');
    }
    await this.cacheService.invalidateUserCache({ _id, email: updated.email });

    this.audit.info(
      AuditEvent.USER_UPDATED,
      'Данные пользователя обновлены администратором',
      {
        targetUserId: id,
        targetEmail: updated.email,
        changes: {
          firstName:
            dto.firstName !== undefined
              ? `${oldUser.firstName} → ${updated.firstName}`
              : undefined,
          lastName:
            dto.lastName !== undefined
              ? `${oldUser.lastName} → ${updated.lastName}`
              : undefined,
        },
      },
    );

    if (dto.role !== undefined && oldUser.role !== updated.role) {
      this.audit.warn(
        AuditEvent.ROLE_CHANGED,
        'Роль пользователя изменена администратором',
        {
          targetUserId: id,
          targetEmail: updated.email,
          oldRole: oldUser.role,
          newRole: updated.role,
        },
      );
    }
    return updated;
  }

  async createByAdmin(dto: AdminCreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const exist = await this.userModel.findOne({ email }).lean().exec();
    if (exist) throw new BadRequestException('Email уже используется');

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.utils.getBcryptRounds(),
    );
    const doc = await this.userModel.create({
      email,
      passwordHash,
      firstName: dto.firstName?.trim(),
      lastName: dto.lastName?.trim(),
      role: dto.role ?? Role.USER,
      isBlocked: !!dto.isBlocked,
    });

    const obj = doc.toObject();
    Reflect.deleteProperty(obj, 'passwordHash');

    this.audit.info(
      AuditEvent.USER_CREATED,
      'Пользователь создан администратором',
      {
        userId: doc._id.toString(),
        email: doc.email,
        role: doc.role,
        isBlocked: doc.isBlocked,
        createdByAdmin: true,
      },
    );
    return obj;
  }

  async setBlockByAdmin(id: string, dto: UpdateUserBlockDto) {
    const _id = new Types.ObjectId(id);
    if (dto.isBlocked) {
      const target = await this.userModel.findById(_id).lean().exec();
      if (!target) {
        throw new BadRequestException('Пользователь не найден');
      }
      if (target.role === Role.ADMIN) {
        const adminCount = await this.userModel.countDocuments({
          role: Role.ADMIN,
          isBlocked: false,
        });
        if (adminCount <= 1) {
          throw new BadRequestException(
            'Нельзя удалить последнего администратора',
          );
        }
      }
    }
    const updated = await this.userModel
      .findByIdAndUpdate(
        _id,
        { isBlocked: dto.isBlocked },
        {
          new: true,
        },
      )
      .select('-passwordHash')
      .lean()
      .exec();
    if (!updated) {
      throw new BadRequestException('Пользователь не найден');
    }
    if (dto.isBlocked) {
      await this.authService.logoutAll(id);
      this.audit.warn(
        AuditEvent.USER_BLOCKED,
        'Пользователь заблокирован администратором',
        {
          targetUserId: id,
          targetEmail: updated.email,
          reason: 'Блокировка администратором',
        },
      );
    } else {
      this.audit.info(
        AuditEvent.USER_UNBLOCKED,
        'Пользователь разблокирован администратором',
        {
          targetUserId: id,
          targetEmail: updated.email,
        },
      );
    }
    await this.cacheService.invalidateUserCache({ _id, email: updated.email });
    return updated;
  }

  async deleteByAdmin(id: string) {
    const _id = new Types.ObjectId(id);
    await this.ensureNotLastAdminForDeletion(_id);

    const deleted = await this.userModel.findByIdAndDelete(_id).lean().exec();
    if (!deleted) {
      throw new BadRequestException('Пользователь не найден');
    }
    await this.cacheService.invalidateUserCache({ _id, email: deleted.email });

    this.audit.warn(
      AuditEvent.USER_DELETED,
      'Пользователь удален администратором',
      {
        targetUserId: id,
        targetEmail: deleted.email,
        role: deleted.role,
      },
    );
    return { id, deleted: true } as const;
  }
}
