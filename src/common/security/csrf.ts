import { NextFunction, Request, Response } from 'express';
import {
  doubleCsrf,
  type DoubleCsrfUtilities,
  type GenerateCsrfTokenOptions,
} from 'csrf-csrf';
import { createHmac } from 'node:crypto';

function getRefreshJti(req: Request): string | undefined {
  const rt =
    (req.cookies?.['refresh_token'] as string | undefined) || undefined;
  if (!rt) return undefined;
  try {
    const [, payloadB64] = rt.split('.') as [string, string, string];
    const json = Buffer.from(payloadB64, 'base64').toString('utf8');
    const payload = JSON.parse(json) as { jti?: string };
    return payload.jti;
  } catch {
    return undefined;
  }
}

function base64url(input: Buffer) {
  return input
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export interface CsrfSuite {
  doubleCsrfProtection: (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => void;
  generateCsrfToken: (
    req: Request,
    res: Response,
    options?: GenerateCsrfTokenOptions,
  ) => string;
  validateRequest: (req: Request) => boolean;
  invalidCsrfTokenError: Error;
}

export function makeCsrfSuite(opts: {
  csrfSecret: string;
  cookieName?: string;
  secure: boolean;
  sameSite: 'lax' | 'strict' | 'none';
  domain?: string;
}): CsrfSuite {
  const suite: DoubleCsrfUtilities = doubleCsrf({
    // Если библиотека требует getSessionIdentifier — можно вернуть jti или стабильную заглушку
    getSessionIdentifier(req: Request): string {
      // Привязка к refresh-сессии (jti) даёт дополнительную изоляцию
      return getRefreshJti(req) ?? 'no-session';
    },
    // Формируем секрет для текущей сессии из jti:
    getSecret: (req: Request): string | string[] => {
      const jti = getRefreshJti(req);
      const material = jti ?? 'no-session';
      const hmac = createHmac('sha256', opts.csrfSecret)
        .update(material)
        .digest();
      return base64url(hmac); // строка, стабильная для данного jti
    },
    cookieName: opts.cookieName ?? 'csrf_token',
    cookieOptions: {
      sameSite: opts.sameSite,
      secure: opts.secure,
      path: '/',
      domain: opts.domain,
      httpOnly: false, // SPA должна читать токен для заголовка
    },
    getCsrfTokenFromRequest: (req: Request) => {
      const token = req.headers['x-csrf-token'];
      return typeof token === 'string' ? token : undefined;
    },
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  });

  // ВАЖНО: типизируем suite без any

  return {
    doubleCsrfProtection: suite.doubleCsrfProtection,
    generateCsrfToken: suite.generateCsrfToken, // больше не any
    validateRequest: suite.validateRequest,
    invalidCsrfTokenError: suite.invalidCsrfTokenError,
  };
}
