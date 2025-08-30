import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/userSchema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>
  ) {}

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
}
