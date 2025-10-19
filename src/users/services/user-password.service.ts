import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/userSchema';
import { AuthService } from '../../auth/auth.service';
import { AuthUtilsService } from '../../auth/services/auth-utils';
import { AuditEvent, AuditService } from '../../auth/services/audit.service';
import { UserCacheService } from './user-cache.service';
import * as bcrypt from 'bcrypt';

export type ChangePasswordResult = { success: true; hint?: string };

@Injectable()
export class UserPasswordService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly utils: AuthUtilsService,
    private readonly audit: AuditService,
    private readonly cacheService: UserCacheService,
  ) {}

  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<ChangePasswordResult> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new BadRequestException('Пользователь не найден');
    }
    const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isMatch) {
      throw new BadRequestException('Старый пароль введен неверно');
    }
    user.passwordHash = await bcrypt.hash(
      newPassword,
      this.utils.getBcryptRounds(),
    );
    await user.save();
    await this.authService.logoutAll(userId);
    await this.cacheService.invalidateUserCache({
      _id: user._id,
      email: user.email,
    });

    this.audit.info(
      AuditEvent.PASSWORD_CHANGED,
      'Пользователь изменил пароль',
      {
        userId: user._id.toString(),
        email: user.email,
      },
    );
    return { success: true };
  }
}
