import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuditService } from '../services/audit.service';

@Injectable()
export class OwnerOrAdminGuard implements CanActivate {
  private readonly logger = new Logger(OwnerOrAdminGuard.name);

  constructor(private readonly audit: AuditService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<
      Request & {
        user?: { sub?: string; role?: string; email?: string };
        params: { userId?: string; id?: string };
      }
    >();

    const role = req.user?.role;
    if (role === 'admin') return true;

    const currentUserId = req.user?.sub;
    const targetUserId = req.params?.userId || req.params?.id;

    if (targetUserId && currentUserId && targetUserId === currentUserId) {
      return true;
    }

    this.audit.logUnauthorizedAccess(
      currentUserId || 'unknown',
      req.user?.email || 'unknown',
      `${req.method} ${req.url}`,
      req.ip,
    );

    this.logger.warn(
      `Access denied: User ${currentUserId} (${req.user?.email}) ` +
        `tried to access resource of user ${targetUserId}. ` +
        `Path: ${req.method} ${req.url}`,
    );

    throw new ForbiddenException('Access denied');
  }
}
