import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import prisma from '../lib/prisma';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../lib/jwt';
import { sendSuccess, sendError, sanitizeUser } from '../lib/helpers';
import { authenticate } from '../middleware/auth';

const router: Router = Router();

// =============================================
// VALIDATION SCHEMAS
// =============================================

const registerSchema = z.object({
  name: z.string().min(2).max(50),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// =============================================
// POST /auth/register
// =============================================

router.post('/register', async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
    return;
  }

  const { name, email, password } = result.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      sendError(res, 'An account with this email already exists', 409);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, passwordHash, emailVerified: true },
    });

    const payload = { userId: user.id, email: user.email, plan: user.plan };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    sendSuccess(
      res,
      { user: sanitizeUser(user), accessToken },
      'Account created successfully',
      201
    );
  } catch (err) {
    console.error('[register]', err);
    sendError(res, 'Failed to create account', 500);
  }
});

// =============================================
// POST /auth/login
// =============================================

router.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Invalid credentials', 400);
    return;
  }

  const { email, password } = result.data;

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      sendError(res, 'Invalid email or password', 401);
      return;
    }

    const payload = { userId: user.id, email: user.email, plan: user.plan };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, { user: sanitizeUser(user), accessToken }, 'Logged in successfully');
  } catch (err) {
    console.error('[login]', err);
    sendError(res, 'Login failed', 500);
  }
});

// =============================================
// POST /auth/refresh
// =============================================

router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    sendError(res, 'No refresh token', 401);
    return;
  }

  try {
    const payload = verifyRefreshToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user) {
      sendError(res, 'User not found', 401);
      return;
    }

    const newPayload = { userId: user.id, email: user.email, plan: user.plan };
    const accessToken = signAccessToken(newPayload);
    const refreshToken = signRefreshToken(newPayload);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    sendSuccess(res, { accessToken });
  } catch {
    sendError(res, 'Invalid refresh token', 401);
  }
});

// =============================================
// POST /auth/logout
// =============================================

router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('refreshToken');
  sendSuccess(res, null, 'Logged out successfully');
});

// =============================================
// GET /auth/me
// =============================================

router.get('/me', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      sendError(res, 'User not found', 404);
      return;
    }

    sendSuccess(res, sanitizeUser(user));
  } catch (err) {
    console.error('[me]', err);
    sendError(res, 'Failed to fetch user', 500);
  }
});

// =============================================
// PATCH /auth/profile
// =============================================

const profileSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  bio: z.string().max(300).optional(),
  skills: z.array(z.string()).optional(),
  githubUrl: z.string().url().optional().or(z.literal('')),
  avatar: z.string().url().optional(),
});

router.patch(
  '/profile',
  authenticate,
  async (req: Request, res: Response) => {
    const result = profileSchema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    try {
      const user = await prisma.user.update({
        where: { id: req.user!.userId },
        data: result.data,
      });
      sendSuccess(res, sanitizeUser(user), 'Profile updated');
    } catch (err) {
      console.error('[profile]', err);
      sendError(res, 'Failed to update profile', 500);
    }
  }
);

export default router;
