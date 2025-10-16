export type SessionLean = {
  jti: string;
  createdAt: Date;
  expiresAt: Date;
  userAgent?: string;
  ip?: string;
};
