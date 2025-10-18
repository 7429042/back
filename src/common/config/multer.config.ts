import { diskStorage } from 'multer';
import { extname } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithUser extends Request {
  user?: {
    sub?: string;
    email?: string;
    role?: string;
  };
}

function sanitizeEmail(email: string): string {
  return email.replace(/[^a-zA-Z0-9_-]/g, '_');
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
      const safeEmail = sanitizeEmail(userEmail);
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
      const safeEmail = sanitizeEmail(userEmail);
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
      const safeSlug = slug.replace(/[^a-zA-Z0-9_-]/g, '_');
      const uploadPath = `./uploads/categories/${safeSlug}`;
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
