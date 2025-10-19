import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role, User, UserDocument } from './schemas/userSchema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AuthUtilsService } from '../auth/services/auth-utils';
import { AuditEvent, AuditService } from '../auth/services/audit.service';
import { UserCacheService } from './services/user-cache.service';
import { UserAvatarService } from './services/user-avatar.service';
import { UserPasswordService } from './services/user-password.service';
import { UserAdminService } from './services/user-admin.service';
import { UserQueryService } from './services/user-query.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AdminCreateUserDto } from './dto/admin-create-user.dto';
import { UpdateUserBlockDto } from './dto/update-user-block.dto';

export type ChangePasswordResult = { success: true; hint?: string };

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
    private readonly utils: AuthUtilsService,
    private readonly audit: AuditService,
    private readonly cacheService: UserCacheService,
    private readonly avatarService: UserAvatarService,
    private readonly passwordService: UserPasswordService,
    private readonly adminService: UserAdminService,
    private readonly queryService: UserQueryService,
  ) {}

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
      await this.cacheService.invalidateUserCache({
        _id: created._id,
        email: created.email,
      });
      this.audit.info(AuditEvent.USER_CREATED, 'Пользователь зарегистрирован', {
        userId: created._id.toString(),
        email: created.email,
        role: created.role,
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
          `Пользователь с "${email}" уже существует`,
        );
      }
      throw e;
    }
  }

  async findById(id: string) {
    return this.queryService.findById(id);
  }

  async findByEmail(email: string) {
    return this.queryService.findByEmail(email);
  }

  async findAuthById(userId: string) {
    return this.queryService.findAuthById(userId);
  }

  async findAdminById(id: string) {
    return this.queryService.findAdminById(id);
  }

  async usersList(query: ListUsersQueryDto) {
    return this.queryService.usersList(query);
  }

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ) {
    return this.passwordService.changePassword(
      userId,
      oldPassword,
      newPassword,
    );
  }

  async updateAvatar(userId: string, filename: string, userEmail: string) {
    return this.avatarService.updateAvatar(userId, filename, userEmail);
  }

  async deleteAvatar(userId: string) {
    return this.avatarService.deleteAvatar(userId);
  }

  async updateByAdmin(id: string, dto: UpdateUserDto) {
    return this.adminService.updateByAdmin(id, dto);
  }

  async createByAdmin(dto: AdminCreateUserDto) {
    return this.adminService.createByAdmin(dto);
  }

  async setBlockByAdmin(id: string, dto: UpdateUserBlockDto) {
    return this.adminService.setBlockByAdmin(id, dto);
  }

  async deleteByAdmin(id: string) {
    return this.adminService.deleteByAdmin(id);
  }
}
