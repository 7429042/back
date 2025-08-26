import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from './schemas/userSchema';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { MongoServerError } from 'mongodb';
import * as bcrypt from 'bcrypt';
import { LoginUserDto } from './dto/login-user.dto';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private jwtService: JwtService,
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

  async findByEmail(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    return await this.userModel
      .findOne({ email: normalizedEmail })
      .select('-passwordHash')
      .lean()
      .exec();
  }

  async login(dto: LoginUserDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .exec();
    if (!user) {
      throw new BadRequestException('Invalid email or password');
    }
    const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Invalid email or password');
    }
    const payload = {
      sub: user._id.toString(),
      role: user.role,
      email: user.email,
    };
    const accessToken = this.jwtService.sign(payload);
    const obj = user.toObject();
    Reflect.deleteProperty(obj, 'passwordHash');
    return { accessToken, user: obj };
  }
}
