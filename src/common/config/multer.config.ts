import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    id: string;
    email: string;
  };
}

export const multerConfig = {
  dest: './uploads/avatars',
};

export const multerOptions = {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (
    req: RequestWithUser,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) {
      cb(null, true);
    } else {
      cb(
        new BadRequestException(
          'Поддерживаются только форматы изображений: jpg, jpeg, png, gif, webp',
        ),
        false,
      );
    }
  },
  storage: diskStorage({
    destination: (
      req: RequestWithUser,
      file: Express.Multer.File,
      cb: (error: Error | null, destination: string) => void,
    ) => {
      // Получаем email пользователя из запроса
      const userEmail = req.user?.email || 'unknown';
      // Создаем безопасное имя папки из email (заменяем @ и . на _)
      const safeEmail = userEmail.replace(/[@.]/g, '_');
      const uploadPath = `${multerConfig.dest}/${safeEmail}`;

      if (!existsSync(uploadPath)) {
        mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (
      req: RequestWithUser,
      file: Express.Multer.File,
      cb: (error: Error | null, filename: string) => void,
    ) => {
      const userEmail = req.user?.email || 'unknown';
      const safeEmail = userEmail.replace(/[@.]/g, '_');
      const timestamp = Date.now();
      const ext = extname(file.originalname);
      // Формат: email_timestamp.ext (например: user_example_com_1234567890.jpg)
      cb(null, `${safeEmail}_${timestamp}${ext}`);
    },
  }),
};

export const categoriesMulterOptions = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.mimetype.match(/\/(jpg|jpeg|png|gif|webp)$/)) cb(null, true);
    else
      cb(
        new BadRequestException(
          'Поддерживаются только форматы изображений: jpg, jpeg, png, gif, webp',
        ),
        false,
      );
  },
  storage: diskStorage({
    destination: (req: Request, file, cb) => {
      const slug = req.params?.slug || 'unknown';
      const uploadPath = `./uploads/categories/${slug}`;
      if (!existsSync(uploadPath)) mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req: Request, file, cb) => {
      const timestamp = Date.now();
      const ext = extname(file.originalname);
      cb(null, `${timestamp}${ext}`);
    },
  }),
};
