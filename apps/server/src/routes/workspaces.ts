import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendSuccess, sendError, generateSlug, generateToken } from '../lib/helpers';
import { authenticate } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/roles';

const router: Router = Router();

// All workspace routes require authentication
router.use(authenticate);

// =============================================
// VALIDATION SCHEMAS
// =============================================

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(200).optional(),
  logo: z.string().url().optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(50).optional(),
  description: z.string().max(200).optional(),
  logo: z.string().url().optional(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

// =============================================
// GET /workspaces — list user's workspaces
// =============================================

router.get('/', async (req: Request, res: Response) => {
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: req.user!.userId },
      include: {
        workspace: {
          include: {
            _count: { select: { projects: true, members: true } },
          },
        },
      },
    });

    const workspaces = memberships.map((m) => ({
      ...m.workspace,
      myRole: m.role,
    }));

    sendSuccess(res, workspaces);
  } catch (err) {
    console.error('[workspaces:list]', err);
    sendError(res, 'Failed to fetch workspaces', 500);
  }
});

// =============================================
// POST /workspaces — create workspace
// =============================================

router.post('/', async (req: Request, res: Response) => {
  const result = createWorkspaceSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
    return;
  }

  const { name, description, logo } = result.data;
  const userId = req.user!.userId;

  // Check free plan limit (1 workspace)
  if (req.user!.plan === 'FREE') {
    const count = await prisma.workspaceMember.count({
      where: { userId, role: 'OWNER' },
    });
    if (count >= 1) {
      sendError(
        res,
        'Free plan allows only 1 workspace. Upgrade to Pro for unlimited.',
        403
      );
      return;
    }
  }

  try {
    let slug = generateSlug(name);
    const existing = await prisma.workspace.findUnique({ where: { slug } });
    if (existing) slug = `${slug}-${Date.now()}`;

    const workspace = await prisma.workspace.create({
      data: {
        name,
        slug,
        description,
        logo,
        ownerId: userId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: {
        _count: { select: { projects: true, members: true } },
      },
    });

    sendSuccess(res, workspace, 'Workspace created', 201);
  } catch (err) {
    console.error('[workspaces:create]', err);
    sendError(res, 'Failed to create workspace', 500);
  }
});

// =============================================
// GET /workspaces/:workspaceId
// =============================================

router.get(
  '/:workspaceId',
  requireWorkspaceRole('VIEWER'),
  async (req: Request, res: Response) => {
    try {
      const workspace = await prisma.workspace.findUnique({
        where: { id: req.params.workspaceId },
        include: {
          members: {
            include: {
              user: {
                select: { id: true, name: true, email: true, avatar: true },
              },
            },
          },
          _count: { select: { projects: true, members: true } },
        },
      });

      if (!workspace) {
        sendError(res, 'Workspace not found', 404);
        return;
      }

      sendSuccess(res, workspace);
    } catch (err) {
      console.error('[workspaces:get]', err);
      sendError(res, 'Failed to fetch workspace', 500);
    }
  }
);

// =============================================
// PATCH /workspaces/:workspaceId
// =============================================

router.patch(
  '/:workspaceId',
  requireWorkspaceRole('ADMIN'),
  async (req: Request, res: Response) => {
    const result = updateWorkspaceSchema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    try {
      const workspace = await prisma.workspace.update({
        where: { id: req.params.workspaceId },
        data: result.data,
      });
      sendSuccess(res, workspace, 'Workspace updated');
    } catch (err) {
      console.error('[workspaces:update]', err);
      sendError(res, 'Failed to update workspace', 500);
    }
  }
);

// =============================================
// DELETE /workspaces/:workspaceId
// =============================================

router.delete(
  '/:workspaceId',
  requireWorkspaceRole('OWNER'),
  async (req: Request, res: Response) => {
    try {
      await prisma.workspace.delete({
        where: { id: req.params.workspaceId },
      });
      sendSuccess(res, null, 'Workspace deleted');
    } catch (err) {
      console.error('[workspaces:delete]', err);
      sendError(res, 'Failed to delete workspace', 500);
    }
  }
);

// =============================================
// POST /workspaces/:workspaceId/invite
// =============================================

router.post(
  '/:workspaceId/invite',
  requireWorkspaceRole('ADMIN'),
  async (req: Request, res: Response) => {
    const result = inviteSchema.safeParse(req.body);
    if (!result.success) {
      sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }

    const { email, role } = result.data;
    const { workspaceId } = req.params;

    try {
      // Check if already a member
      const existingUser = await prisma.user.findUnique({ where: { email } });
      if (existingUser) {
        const alreadyMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId, userId: existingUser.id },
          },
        });
        if (alreadyMember) {
          sendError(res, 'User is already a member of this workspace', 409);
          return;
        }
      }

      const token = generateToken(40);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

      const invite = await prisma.workspaceInvite.create({
        data: { workspaceId, email, role, token, expiresAt },
        include: { workspace: { select: { name: true } } },
      });

      // TODO Phase 3: send actual email via Resend
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
      console.log(`[INVITE] ${email} → ${inviteUrl}`);

      sendSuccess(
        res,
        { invite, inviteUrl },
        'Invite created. Email sending coming in Phase 3.',
        201
      );
    } catch (err) {
      console.error('[workspaces:invite]', err);
      sendError(res, 'Failed to create invite', 500);
    }
  }
);

// =============================================
// POST /workspaces/invite/:token/accept
// =============================================

router.post(
  '/invite/:token/accept',
  async (req: Request, res: Response) => {
    const { token } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      sendError(res, 'Must be logged in to accept invite', 401);
      return;
    }

    try {
      const invite = await prisma.workspaceInvite.findUnique({
        where: { token },
      });

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        sendError(res, 'Invite is invalid or has expired', 400);
        return;
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (user?.email !== invite.email) {
        sendError(res, 'This invite was sent to a different email address', 403);
        return;
      }

      await prisma.$transaction([
        prisma.workspaceMember.upsert({
          where: {
            workspaceId_userId: {
              workspaceId: invite.workspaceId,
              userId,
            },
          },
          update: { role: invite.role },
          create: {
            workspaceId: invite.workspaceId,
            userId,
            role: invite.role,
          },
        }),
        prisma.workspaceInvite.update({
          where: { token },
          data: { acceptedAt: new Date() },
        }),
      ]);

      sendSuccess(res, null, 'Invite accepted. Welcome to the workspace!');
    } catch (err) {
      console.error('[workspaces:accept-invite]', err);
      sendError(res, 'Failed to accept invite', 500);
    }
  }
);

export default router;
