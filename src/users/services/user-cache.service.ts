import { Injectable } from '@nestjs/common';
import { SimpleRedisService } from '../../redis/redis.service';
import { Types } from 'mongoose';

@Injectable()
export class UserCacheService {
  constructor(private readonly cache: SimpleRedisService) {}

  private cacheKeyById(id: string) {
    return `user:byId:${id}`;
  }

  private cacheKeyByEmail(email: string) {
    return `user:byEmail:${email.toLowerCase().trim()}`;
  }

  keyUsersList(query: {
    offset?: number;
    limit?: number;
    sortBy?: string;
    sortDirection?: 1 | -1;
    role?: string;
    isBlocked?: boolean;
    q?: string;
  }) {
    const offset = Math.max(query?.offset ?? 0, 0);
    const limit = Math.min(Math.max(query?.limit ?? 20, 1), 100);

    const allowedSortFields = ['createdAt', 'updatedAt', 'email'];
    const sortBy = allowedSortFields.includes(query?.sortBy ?? '')
      ? query.sortBy
      : 'createdAt';

    const sortDirection =
      query?.sortDirection === 1 || query?.sortDirection === -1
        ? query.sortDirection
        : -1;

    const role = query?.role ?? 'all';
    const isBlocked =
      typeof query?.isBlocked === 'boolean' ? query.isBlocked : 'all';

    const searchQuery = query?.q?.trim() || 'none';

    const parts = [
      'users:list',
      `o${offset}`,
      `l${limit}`,
      `s${sortBy}`,
      `d${sortDirection}`,
      `r${role}`,
      `b${isBlocked}`,
      `q${searchQuery}`,
    ];
    return parts.join(':');
  }

  async invalidateUserCache(u: { _id: Types.ObjectId; email: string | null }) {
    await this.cache.safeDel(this.cacheKeyById(u._id.toString()));
    if (u.email) {
      await this.cache.safeDel(this.cacheKeyByEmail(u.email));
    }
  }

  async invalidateAuthStatusCache(userId: string): Promise<void> {
    const authStatusKey = `user:auth:status:${userId}`;
    await this.cache.safeDel(authStatusKey);
  }

  async getOrSet<T>(
    key: string,
    ttl: number,
    producer: () => Promise<T>,
  ): Promise<T> {
    return this.cache.getOrSet(key, ttl, producer);
  }
}
