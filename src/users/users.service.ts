import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role, User, UserDocument } from './schemas/userSchema';
import { Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcrypt';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ConfigService } from '@nestjs/config';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthService } from '../auth/auth.service';
import { UpdateUserBlockDto } from './dto/update-user-block.dto';
import { join } from 'path';
import { unlink } from 'fs/promises';

export type ChangePasswordResult = { success: true; hint?: string };

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  private escapeRegExp(input: string): string {
    // экранируем спецсимволы RegExp, чтобы не падать на пользовательском вводе
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async onModuleInit() {
    const email = this.configService.get<string>('ADMIN_EMAIL');
    const password = this.configService.get<string>('ADMIN_PASSWORD');
    if (!email || !password) return;

    const normalized = email.toLowerCase().trim();
    const exist = await this.userModel.exists({ email: normalized });
    if (exist) return;

    const passwordHash = await bcrypt.hash(password, 10);
    await this.userModel.create({
      email: normalized,
      passwordHash,
      role: Role.ADMIN,
      firstName: this.configService
        .get<string>('ADMIN_FIRST_NAME', 'Admin')
        .trim(),
      lastName: this.configService
        .get<string>('ADMIN_LAST_NAME', 'Admin')
        .trim(),
    });
  }

  async create(dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const passwordHash = await bcrypt.hash(dto.password, 10);
    try {
      const created = await this.userModel.create({
        email,
        passwordHash,
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
      });
      return {
        id: String(created._id),
        email: created.email,
        firstName: created.firstName ?? null,
        lastName: created.lastName ?? null,
        role: created.role,
        isBlocked: created.isBlocked,
        createdAt: created['createdAt'] as Date | undefined,
        updatedAt: created['updatedAt'] as Date | undefined,
      };
    } catch (e) {
      if (e instanceof MongoServerError && e.code === 11000) {
        throw new BadRequestException(
          `User with email "${email}" already exists`,
        );
      }
      throw e;
    }
  }

  async findById(id: string) {
    return await this.userModel
      .findById(id)
      .select('-passwordHash')
      .lean()
      .exec();
  }

  async findByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    return this.userModel.findOne({ email: normalized }).exec();
  }

  async findAuthById(userId: string) {
    return await this.userModel.findById(userId).exec();
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult> {
    const user = await this.findAuthById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Old password is incorrect');
    }
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await user.save();
    await this.authService.logoutAll(userId);
    return { success: true };
  }

  private async deleteAvatarFile(avatarUrl: string): Promise<void> {
    try {
      const avatarPath = join(process.cwd(), avatarUrl);
      await unlink(avatarPath);
    } catch (error) {
      console.error('Ошибка удаления аватара:', error);
    }
  }

  async updateAvatar(
    userId: string,
    filename: string,
    userEmail: string,
  ): Promise<{ avatarUrl: string }> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Удаляем старый аватар, если есть
    if (user.avatarUrl) {
      await this.deleteAvatarFile(user.avatarUrl);
    }

    const safeEmail = userEmail.replace(/[@.]/g, '_');
    const avatarUrl = `uploads/avatars/${safeEmail}/${filename}`;
    user.avatarUrl = avatarUrl;
    await user.save();

    return { avatarUrl };
  }

  async deleteAvatar(userId: string): Promise<User> {
    const user = await this.userModel.findById(userId);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (user.avatarUrl) {
      await this.deleteAvatarFile(user.avatarUrl);
      user.avatarUrl = undefined;
      await user.save();
    }

    return user;
  }

  async usersList(query: ListUsersQueryDto) {
    // Безопасные дефолты и нормализация
    const offset = Math.max(query?.offset ?? 0, 0);
    const limit = Math.min(Math.max(query?.limit ?? 20, 1), 100);

    type AllowedSort = 'createdAt' | 'updatedAt' | 'email';
    const allowedSort: readonly AllowedSort[] = [
      'createdAt',
      'updatedAt',
      'email',
    ];
    let sortBy: AllowedSort = 'createdAt';
    if (query?.sortBy && allowedSort.includes(query.sortBy)) {
      sortBy = query.sortBy;
    }
    const sortDirection: 1 | -1 =
      query?.sortDirection === 1 || query?.sortDirection === -1
        ? query.sortDirection
        : -1;

    // Фильтры
    const where: Record<string, unknown> = {};
    if (query?.role) {
      where.role = query.role;
    }
    if (typeof query?.isBlocked === 'boolean') {
      where.isBlocked = query.isBlocked;
    }

    const q = query.q?.trim();
    if (q && q.length >= 2) {
      const needle = new RegExp(this.escapeRegExp(q), 'i');
      where.$or = [
        { email: needle },
        { firstName: needle },
        { lastName: needle },
      ];
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(where, { passwordHash: 0 })
        .sort({ [sortBy]: sortDirection })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(where).exec(),
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
          role: query.role ?? null,
          isBlocked:
            typeof query.isBlocked === 'boolean' ? query.isBlocked : null,
          q: q ?? null,
        },
      },
    };
  }

  async findAdminById(id: string) {
    return await this.userModel
      .findById(new Types.ObjectId(id))
      .select('-passwordHash')
      .lean()
      .exec();
  }

  private async ensureNotLastAdminForRoleChange(
    targetUserId: Types.ObjectId,
    nextRole?: Role,
  ) {
    if (!nextRole) return;
    if (nextRole !== Role.ADMIN) {
      const [target, adminCount] = await Promise.all([
        this.userModel.findById(targetUserId).lean().exec(),
        this.userModel.countDocuments({ role: Role.ADMIN }),
      ]);
      if (target?.role === Role.ADMIN && adminCount <= 1) {
        throw new BadRequestException('Cannot remove last admin');
      }
    }
  }

  private async ensureNotLastAdminForDeletion(targetUserId: Types.ObjectId) {
    const user = await this.userModel.findById(targetUserId).lean().exec();
    if (user?.role !== Role.ADMIN) return;
    const adminCount = await this.userModel.countDocuments({
      role: Role.ADMIN,
    });
    if (adminCount <= 1) {
      throw new BadRequestException('Cannot delete last admin');
    }
  }

  async updateByAdmin(id: string, dto: UpdateUserDto) {
    const _id = new Types.ObjectId(id);
    await this.ensureNotLastAdminForRoleChange(_id, dto.role);

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
      throw new BadRequestException('User not found');
    }
    return updated;
  }

  async setBlockByAdmin(id: string, dto: UpdateUserBlockDto) {
    const _id = new Types.ObjectId(id);
    if (dto.isBlocked) {
      const target = await this.userModel.findById(_id).lean().exec();
      if (!target) {
        throw new BadRequestException('User not found');
      }
      if (target.role === Role.ADMIN) {
        const adminCount = await this.userModel.countDocuments({
          role: Role.ADMIN,
          isBlocked: false,
        });
        if (adminCount <= 1) {
          throw new BadRequestException('Cannot remove last admin');
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
      throw new BadRequestException('User not found');
    }
    if (dto.isBlocked) {
      await this.authService.logoutAll(id);
    }
    return updated;
  }

  async deleteByAdmin(id: string) {
    const _id = new Types.ObjectId(id);
    await this.ensureNotLastAdminForDeletion(_id);

    const deleted = await this.userModel.findByIdAndDelete(_id).lean().exec();
    if (!deleted) {
      throw new BadRequestException('User not found');
    }
    return { id, deleted: true };
  }
}
