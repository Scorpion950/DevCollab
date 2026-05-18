import { Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { sendError } from '../lib/helpers';
import { Role } from '@prisma/client';

// Role hierarchy: OWNER > ADMIN > MEMBER > VIEWER
const ROLE_WEIGHT: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

function hasRole(userRole: Role, requiredRole: Role): boolean {
  return ROLE_WEIGHT[userRole] >= ROLE_WEIGHT[requiredRole];
}

/**
 * Middleware: require user to be workspace member with at least the given role
 * Expects :workspaceId in route params
 */
export function requireWorkspaceRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { workspaceId } = req.params;

    if (!userId || !workspaceId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    if (!member) {
      sendError(res, 'You are not a member of this workspace', 403);
      return;
    }

    if (!hasRole(member.role, minRole)) {
      sendError(
        res,
        `Requires at least ${minRole} role in this workspace`,
        403
      );
      return;
    }

    next();
  };
}

/**
 * Middleware: require user to be project member with at least the given role
 * Falls back to workspace role if user has workspace ADMIN/OWNER
 * Expects :projectId in route params
 */
export function requireProjectRole(minRole: Role) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user?.userId;
    const { projectId } = req.params;

    if (!userId || !projectId) {
      sendError(res, 'Unauthorized', 401);
      return;
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });

    if (!project) {
      sendError(res, 'Project not found', 404);
      return;
    }

    // Check workspace role (OWNER/ADMIN can access all projects)
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: project.workspaceId,
          userId,
        },
      },
    });

    if (workspaceMember && hasRole(workspaceMember.role, 'ADMIN')) {
      next();
      return;
    }

    // Check project-specific role
    const projectMember = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });

    if (!projectMember) {
      sendError(res, 'You are not a member of this project', 403);
      return;
    }

    if (!hasRole(projectMember.role, minRole)) {
      sendError(
        res,
        `Requires at least ${minRole} role in this project`,
        403
      );
      return;
    }

    next();
  };
}
