import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from '../schemas/userSchema';
import { Model } from 'mongoose';
import { basename, extname, join, normalize, sep } from 'path';
import { unlink } from 'fs/promises';
import { UserCacheService } from './user-cache.service';

@Injectable()
export class UserAvatarService {
  private readonly ALLOWED_AVATAR_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
  ];

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly cacheService: UserCacheService,
  ) {}

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
    await this.cacheService.invalidateUserCache({
      _id: user._id,
      email: user.email,
    });
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
      await this.cacheService.invalidateUserCache({
        _id: user._id,
        email: user.email,
      });
    }

    return user;
  }
}
