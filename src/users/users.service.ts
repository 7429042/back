import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Role, User, UserDocument } from './schemas/userSchema';
import { Model, Types } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcrypt';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { ConfigService } from '@nestjs/config';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly configService: ConfigService,
  ) {}

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
      role: 'admin',
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
      const obj = created.toObject();
      Reflect.deleteProperty(obj, 'passwordHash');
      return obj;
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

  async usersList(query: ListUsersQueryDto) {
    const offset = query?.offset ?? 0;
    const limit = query?.limit ?? 20;
    const sortBy = query?.sortBy ?? 'createdAt';
    const sortDirection = query?.sortDirection ?? -1;

    const [items, total] = await Promise.all([
      this.userModel
        .find({}, { passwordHash: 0 })
        .sort({ [sortBy]: sortDirection })
        .skip(offset)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments({}).exec(),
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
