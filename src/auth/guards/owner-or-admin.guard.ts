import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

// ... existing code ...
@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & {
        user?: { sub?: string; role?: string };
        params: { userId?: string; id?: string };
      }
    >();

    const role = req.user?.role;
    if (role === 'admin') return true;

    const currentUserId = req.user?.sub;
    const paramUserId = req.params?.userId;
    const paramId = req.params?.id;

    if (paramUserId && currentUserId && paramUserId === currentUserId) {
      return true;
    }

    if (paramId && currentUserId) {
      return true;
    }

    throw new ForbiddenException('Access denied');
  }
}
