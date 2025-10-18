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
import { basename, extname, join, normalize, sep } from 'path';
import { unlink } from 'fs/promises';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { SimpleRedisService } from '../redis/redis.service';
import { AuthUtilsService } from '../auth/services/auth-utils';

export type ChangePasswordResult = { success: true; hint?: string };

@Injectable()
export class UsersService {
  private readonly ALLOWED_AVATAR_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
  ];
  private readonly MAX_AVATAR_SIZE_MB = 5;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly cache: SimpleRedisService,
    private readonly utils: AuthUtilsService,
  ) {}

  private cacheKeyById(id: string) {
    return `user:byId:${id}`;
  }

  private cacheKeyByEmail(email: string) {
    return `user:byEmail:${email.toLowerCase().trim()}`;
  }

  private keyUsersList(query: ListUsersQueryDto) {
    const safe = {
      offset: Math.max(query?.offset ?? 0, 0),
      limit: Math.min(Math.max(query?.limit ?? 20, 1), 100),
      sortBy: ['createdAt', 'updatedAt', 'email'].includes(query?.sortBy ?? '')
        ? query.sortBy
        : 'createdAt',
      sortDirection:
        query?.sortDirection === 1 || query?.sortDirection === -1
          ? query.sortDirection
          : -1,
      role: query?.role ?? null,
      isBlocked: typeof query?.isBlocked === 'boolean' ? query.isBlocked : null,
      q: query?.q ?? null,
    } as const;
    const row = JSON.stringify(safe);
    let hash = 0;
    for (let i = 0; i < row.length; i++) {
      hash = (hash * 31 + row.charCodeAt(i)) | 0;
    }
    return `users:list:${hash}`;
  }

  private async invalidateUserCache(u: {
    _id: Types.ObjectId;
    email: string | null;
  }) {
    await this.cache.safeDel(this.cacheKeyById(u._id.toString()));
    if (u.email) {
      await this.cache.safeDel(this.cacheKeyByEmail(u.email));
    }
  }

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

    const passwordHash = await bcrypt.hash(
      password,
      this.utils.getBcryptRounds(),
    );
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
    const passwordHash = await bcrypt.hash(
      dto.password,
      this.utils.getBcryptRounds(),
    );
    try {
      const created = await this.userModel.create({
        email,
        passwordHash,
        firstName: dto.firstName?.trim(),
        lastName: dto.lastName?.trim(),
      });
      await this.invalidateUserCache({
        _id: created._id,
        email: created.email,
      });
      return {
        id: String(created._id),
        email: created.email,
        firstName: created.firstName ?? null,
        lastName: created.lastName ?? null,
        role: created.role,
        isBlocked: created.isBlocked,
        createdAt: created['createdAt'] as Date,
        updatedAt: created['updatedAt'] as Date,
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
    const key = this.cacheKeyById(id);
    const val = await this.cache.getOrSet(key, 60, async () => {
      const user = await this.userModel.findById(id).lean();
      if (!user) return null;
      Reflect.deleteProperty(user, 'passwordHash');
      return user;
    });
    if (!val) throw new NotFoundException('User not found');
    return val;
  }

  async findByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    const key = this.cacheKeyByEmail(normalized);
    return this.cache.getOrSet(key, 60, async () => {
      return this.userModel.findOne({ email: normalized }).exec();
    });
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
    user.passwordHash = await bcrypt.hash(
      newPassword,
      this.utils.getBcryptRounds(),
    );
    await user.save();
    await this.authService.logoutAll(userId);
    await this.invalidateUserCache({ _id: user._id, email: user.email });
    return { success: true };
  }

  private async deleteAvatarFile(avatarUrl: string): Promise<void> {
    try {
      const avatarPath = normalize(join(process.cwd(), avatarUrl));
      await unlink(avatarPath);
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ENOENT') {
        console.error('Ошибка удаления аватара:', error);
      }
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

    const ext = extname(filename).toLowerCase();
    if (!this.ALLOWED_AVATAR_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Недопустимое расширение файла. Разрешены: ${this.ALLOWED_AVATAR_EXTENSIONS.join(', ')}`,
      );
    }

    const safeEmail = userEmail.replace(/[^a-zA-Z0-9_-]/g, '_');
    const baseDir = join('uploads', 'avatars', safeEmail);
    const baseDirNorm = normalize(baseDir + sep);

    const safeName = basename(filename);
    const avatarRel = join(baseDir, safeName);
    const avatarNorm = normalize(avatarRel);

    if (!avatarNorm.startsWith(baseDirNorm)) {
      throw new BadRequestException('Недопустимое имя файла');
    }

    const fullPath = join(process.cwd(), avatarNorm);
    try {
      await import('fs/promises').then((fs) => fs.access(fullPath));
    } catch {
      throw new BadRequestException('Файл аватара не найден на сервере');
    }

    if (user.avatarUrl) {
      await this.deleteAvatarFile(user.avatarUrl);
    }

    const normalizedPath = avatarNorm.replace(/\\/g, '/');

    user.avatarUrl = normalizedPath;
    await user.save();
    await this.invalidateUserCache({ _id: user._id, email: user.email });
    return { avatarUrl: normalizedPath };
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
      await this.invalidateUserCache({ _id: user._id, email: user.email });
    }

    return user;
  }

  async usersList(query: ListUsersQueryDto) {
    const key = this.keyUsersList(query);
    return this.cache.getOrSet(key, 30, async () => {
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
    });
  }

  async findAdminById(id: string) {
    return await this.userModel
      .findById(id)
      .select('-passwordHash')
      .lean()
      .exec();
  }

  private async ensureNotLastAdminForRoleChange(
    targetUserId: Types.ObjectId,
    nextRole?: Role,
  ) {
    if (!nextRole || nextRole === Role.ADMIN) return;
    const result = await this.userModel.updateOne({
      _id: targetUserId,
      role: Role.ADMIN,
      $where: function () {
        return db.users.countDocuments({ role: 'admin' }) > 1;
      },
    });
    {
      role: nextRole;
    }
    if (result.matchedCount === 0) {
      // Либо пользователь не найден, либо он последний админ
      const target = await this.userModel.findById(targetUserId).lean().exec();
      if (!target) {
        throw new BadRequestException('User not found');
      }
      if (target.role === Role.ADMIN) {
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
    await this.invalidateUserCache({ _id, email: updated.email });
    return updated;
  }

  async createByAdmin(dto: AdminCreateUserDto) {
    const email = dto.email.toLowerCase().trim();
    const exist = await this.userModel.findOne({ email }).lean().exec();
    if (exist) throw new BadRequestException('Email already in use');

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
    return obj;
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
    await this.invalidateUserCache({ _id, email: updated.email });
    return updated;
  }

  async deleteByAdmin(id: string) {
    const _id = new Types.ObjectId(id);
    await this.ensureNotLastAdminForDeletion(_id);

    const deleted = await this.userModel.findByIdAndDelete(_id).lean().exec();
    if (!deleted) {
      throw new BadRequestException('User not found');
    }
    await this.invalidateUserCache({ _id, email: deleted.email });
    return { id, deleted: true } as const;
  }
}
