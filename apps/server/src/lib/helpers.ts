import { Response } from 'express';

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: Record<string, string[]>;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  statusCode = 200
): Response {
  return res.status(statusCode).json({
    success: true,
    data,
    ...(message && { message }),
  } satisfies ApiSuccessResponse<T>);
}

export function sendError(
  res: Response,
  error: string,
  statusCode = 400,
  details?: Record<string, string[]>
): Response {
  return res.status(statusCode).json({
    success: false,
    error,
    ...(details && { details }),
  } satisfies ApiErrorResponse);
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function generateToken(length = 32): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function sanitizeUser(user: {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  bio: string | null;
  skills: string[];
  githubUrl: string | null;
  plan: string;
  aiUsageToday: number;
  aiLastUsedAt: Date | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  passwordHash?: string;
  verifyToken?: string | null;
  resetToken?: string | null;
  resetTokenExp?: Date | null;
}) {
  const {
    passwordHash: _pw,
    verifyToken: _vt,
    resetToken: _rt,
    resetTokenExp: _rte,
    ...safe
  } = user;
  return safe;
}
