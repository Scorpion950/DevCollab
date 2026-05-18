import { Router, Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { sendSuccess, sendError } from '../lib/helpers';
import { authenticate } from '../middleware/auth';
import { requireWorkspaceRole, requireProjectRole } from '../middleware/roles';

const router = Router({ mergeParams: true });

router.use(authenticate);

// =============================================
// SCHEMAS
// =============================================

const createProjectSchema = z.object({
  name: z.string().min(2).max(50),
  description: z.string().max(300).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default('#7C3AED'),
  emoji: z.string().max(4).optional(),
});

const updateProjectSchema = createProjectSchema.partial();

// =============================================
// GET /workspaces/:workspaceId/projects
// =============================================

router.get('/', requireWorkspaceRole('VIEWER'), async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { workspaceId: req.params.workspaceId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        _count: {
          select: { tasks: true, snippets: true, wikiPages: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    sendSuccess(res, projects);
  } catch (err) {
    console.error('[projects:list]', err);
    sendError(res, 'Failed to fetch projects', 500);
  }
});

// =============================================
// POST /workspaces/:workspaceId/projects
// =============================================

router.post('/', requireWorkspaceRole('MEMBER'), async (req: Request, res: Response) => {
  const result = createProjectSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
    return;
  }

  const userId = req.user!.userId;
  const { workspaceId } = req.params;

  // Free plan: max 3 projects per workspace
  if (req.user!.plan === 'FREE') {
    const count = await prisma.project.count({ where: { workspaceId } });
    if (count >= 3) {
      sendError(res, 'Free plan allows up to 3 projects per workspace. Upgrade to Pro.', 403);
      return;
    }
  }

  try {
    const project = await prisma.project.create({
      data: {
        ...result.data,
        workspaceId,
        members: {
          create: { userId, role: 'OWNER' },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, avatar: true } },
          },
        },
        _count: { select: { tasks: true, snippets: true, wikiPages: true } },
      },
    });

    // Log activity
    await prisma.activityLog.create({
      data: {
        workspaceId,
        projectId: project.id,
        userId,
        action: 'created',
        entityType: 'project',
        entityId: project.id,
        metadata: { projectName: project.name },
      },
    });

    sendSuccess(res, project, 'Project created', 201);
  } catch (err) {
    console.error('[projects:create]', err);
    sendError(res, 'Failed to create project', 500);
  }
});

// =============================================
// GET /workspaces/:workspaceId/projects/:projectId
// =============================================

router.get('/:projectId', requireProjectRole('VIEWER'), async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
        _count: { select: { tasks: true, snippets: true, wikiPages: true } },
      },
    });

    if (!project) {
      sendError(res, 'Project not found', 404);
      return;
    }

    sendSuccess(res, project);
  } catch (err) {
    console.error('[projects:get]', err);
    sendError(res, 'Failed to fetch project', 500);
  }
});

// =============================================
// PATCH /workspaces/:workspaceId/projects/:projectId
// =============================================

router.patch('/:projectId', requireProjectRole('ADMIN'), async (req: Request, res: Response) => {
  const result = updateProjectSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Validation failed', 400, result.error.flatten().fieldErrors as Record<string, string[]>);
    return;
  }

  try {
    const project = await prisma.project.update({
      where: { id: req.params.projectId },
      data: result.data,
    });
    sendSuccess(res, project, 'Project updated');
  } catch (err) {
    console.error('[projects:update]', err);
    sendError(res, 'Failed to update project', 500);
  }
});

// =============================================
// DELETE /workspaces/:workspaceId/projects/:projectId
// =============================================

router.delete('/:projectId', requireProjectRole('OWNER'), async (req: Request, res: Response) => {
  try {
    await prisma.project.delete({ where: { id: req.params.projectId } });
    sendSuccess(res, null, 'Project deleted');
  } catch (err) {
    console.error('[projects:delete]', err);
    sendError(res, 'Failed to delete project', 500);
  }
});

// =============================================
// POST /workspaces/:workspaceId/projects/:projectId/members
// =============================================

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER'),
});

router.post('/:projectId/members', requireProjectRole('ADMIN'), async (req: Request, res: Response) => {
  const result = addMemberSchema.safeParse(req.body);
  if (!result.success) {
    sendError(res, 'Validation failed', 400);
    return;
  }

  try {
    const member = await prisma.projectMember.upsert({
      where: {
        projectId_userId: {
          projectId: req.params.projectId,
          userId: result.data.userId,
        },
      },
      update: { role: result.data.role },
      create: {
        projectId: req.params.projectId,
        userId: result.data.userId,
        role: result.data.role,
      },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
      },
    });

    sendSuccess(res, member, 'Member added to project', 201);
  } catch (err) {
    console.error('[projects:add-member]', err);
    sendError(res, 'Failed to add member', 500);
  }
});

export default router;
