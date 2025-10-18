import { Injectable, Logger } from '@nestjs/common';

export enum AuditEvent {
  // Аутентификация
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILED = 'LOGIN_FAILED',
  LOGIN_BLOCKED_BRUTE_FORCE = 'LOGIN_BLOCKED_BRUTE_FORCE',

  // Сессии
  TOKEN_REFRESH_SUCCESS = 'TOKEN_REFRESH_SUCCESS',
  TOKEN_REFRESH_FAILED = 'TOKEN_REFRESH_FAILED',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  SESSION_REVOKED = 'SESSION_REVOKED',

  // Rate Limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Изменения пользователей
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
  USER_DELETED = 'USER_DELETED',
  USER_BLOCKED = 'USER_BLOCKED',
  USER_UNBLOCKED = 'USER_UNBLOCKED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',

  // Роли
  ROLE_CHANGED = 'ROLE_CHANGED',

  // Подозрительная активность
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',
}

export enum AuditLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface AuditMetadata {
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  targetUserId?: string; // Для операций над другими пользователями
  targetEmail?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  errorMessage?: string;
  [key: string]: unknown; // Дополнительные поля
}

export interface AuditRecord {
  timestamp: string;
  event: AuditEvent;
  level: AuditLevel;
  message: string;
  metadata?: AuditMetadata;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  info(event: AuditEvent, message: string, metadata?: AuditMetadata): void {
    this.log(AuditLevel.INFO, event, message, metadata);
  }

  warn(event: AuditEvent, message: string, metadata?: AuditMetadata): void {
    this.log(AuditLevel.WARNING, event, message, metadata);
  }

  error(event: AuditEvent, message: string, metadata?: AuditMetadata): void {
    this.log(AuditLevel.ERROR, event, message, metadata);
  }

  critical(event: AuditEvent, message: string, metadata?: AuditMetadata): void {
    this.log(AuditLevel.CRITICAL, event, message, metadata);
  }

  private log(
    level: AuditLevel,
    event: AuditEvent,
    message: string,
    metadata?: AuditMetadata,
  ): void {
    const record: AuditRecord = {
      timestamp: new Date().toISOString(),
      event,
      level,
      message,
      metadata,
    };

    // Форматируем для вывода в консоль
    const formatted = this.formatRecord(record);
    // Выбираем метод логирования по уровню
    switch (level) {
      case AuditLevel.INFO:
        this.logger.log(formatted);
        break;
      case AuditLevel.WARNING:
        this.logger.warn(formatted);
        break;
      case AuditLevel.ERROR:
      case AuditLevel.CRITICAL:
        this.logger.error(formatted);
        break;
    }

    // В production можно добавить отправку в внешние системы:
    // - ELK Stack (Elasticsearch, Logstash, Kibana)
    // - Sentry для ошибок
    // - Datadog для метрик
    // - CloudWatch для AWS
    // this.sendToExternalSystem(record);
  }

  /**
   * Форматирует запись аудита для читаемого вывода
   */
  private formatRecord(record: AuditRecord): string {
    const parts = [`[${record.level}]`, `[${record.event}]`, record.message];

    if (record.metadata) {
      const meta = this.formatMetadata(record.metadata);
      if (meta) parts.push(`| ${meta}`);
    }

    return parts.join(' ');
  }

  /**
   * Форматирует метаданные в читаемую строку
   */
  private formatMetadata(metadata: AuditMetadata): string {
    const parts: string[] = [];

    if (metadata.userId) parts.push(`userId=${metadata.userId}`);
    if (metadata.email) parts.push(`email=${metadata.email}`);
    if (metadata.ip) parts.push(`ip=${metadata.ip}`);
    if (metadata.targetUserId)
      parts.push(`targetUserId=${metadata.targetUserId}`);
    if (metadata.endpoint) parts.push(`endpoint=${metadata.endpoint}`);
    if (metadata.statusCode) parts.push(`status=${metadata.statusCode}`);
    if (metadata.errorMessage) parts.push(`error="${metadata.errorMessage}"`);

    return parts.join(', ');
  }

  /**
   * Вспомогательный метод для логирования успешного входа
   */
  logLoginSuccess(
    userId: string,
    email: string,
    ip?: string,
    userAgent?: string,
  ): void {
    this.info(AuditEvent.LOGIN_SUCCESS, `User logged in successfully`, {
      userId,
      email,
      ip,
      userAgent,
    });
  }

  /**
   * Вспомогательный метод для логирования неудачного входа
   */
  logLoginFailed(email: string, ip?: string, reason?: string): void {
    this.warn(
      AuditEvent.LOGIN_FAILED,
      `Login failed: ${reason || 'Invalid credentials'}`,
      {
        email,
        ip,
        errorMessage: reason,
      },
    );
  }

  /**
   * Вспомогательный метод для логирования блокировки brute force
   */
  logBruteForceBlock(email: string, ip?: string, attempts?: number): void {
    this.warn(
      AuditEvent.LOGIN_BLOCKED_BRUTE_FORCE,
      `Login blocked due to too many failed attempts`,
      {
        email,
        ip,
        attempts,
      },
    );
  }

  /**
   * Вспомогательный метод для логирования превышения rate limit
   */
  logRateLimitExceeded(
    clientId: string,
    endpoint: string,
    method: string,
  ): void {
    this.warn(AuditEvent.RATE_LIMIT_EXCEEDED, `Rate limit exceeded`, {
      ip: clientId,
      endpoint,
      method,
    });
  }

  /**
   * Вспомогательный метод для логирования изменения пароля
   */
  logPasswordChanged(userId: string, email: string, ip?: string): void {
    this.info(AuditEvent.PASSWORD_CHANGED, `Password changed`, {
      userId,
      email,
      ip,
    });
  }

  /**
   * Вспомогательный метод для логирования блокировки пользователя
   */
  logUserBlocked(
    adminId: string,
    targetUserId: string,
    targetEmail: string,
    reason?: string,
  ): void {
    this.warn(AuditEvent.USER_BLOCKED, `User blocked by admin`, {
      userId: adminId,
      targetUserId,
      targetEmail,
      reason,
    });
  }

  /**
   * Вспомогательный метод для логирования попытки несанкционированного доступа
   */
  logUnauthorizedAccess(
    userId: string,
    email: string,
    targetResource: string,
    ip?: string,
  ): void {
    this.error(
      AuditEvent.UNAUTHORIZED_ACCESS_ATTEMPT,
      `Unauthorized access attempt to ${targetResource}`,
      {
        userId,
        email,
        ip,
        endpoint: targetResource,
      },
    );
  }
}
