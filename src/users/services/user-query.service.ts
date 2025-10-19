import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../schemas/userSchema';
import { Model } from 'mongoose';
import { UserCacheService } from './user-cache.service';
import { ListUsersQueryDto } from '../dto/list-users-query.dto';

@Injectable()
export class UserQueryService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly cacheService: UserCacheService,
  ) {}

  private escapeRegExp(input: string): string {
    // экранируем спецсимволы RegExp, чтобы не падать на пользовательском вводе
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  async findById(id: string) {
    const key = `user:byId:${id}`;
    const val = await this.cacheService.getOrSet(key, 60, async () => {
      const user = await this.userModel.findById(id).lean();
      if (!user) return null;
      Reflect.deleteProperty(user, 'passwordHash');
      return user;
    });
    if (!val) throw new NotFoundException('Пользователь не найден');
    return val;
  }

  async findByEmail(email: string) {
    const normalized = email.toLowerCase().trim();
    const key = `user:byEmail:${normalized}`;
    return this.cacheService.getOrSet(key, 60, async () => {
      return this.userModel.findOne({ email: normalized }).exec();
    });
  }

  async findAuthById(userId: string) {
    return await this.userModel.findById(userId).exec();
  }

  async usersList(query: ListUsersQueryDto) {
    const key = this.cacheService.keyUsersList(query);
    return this.cacheService.getOrSet(key, 30, async () => {
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
      if (q && q.length >= 2) where.$text = { $search: q };

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
}
