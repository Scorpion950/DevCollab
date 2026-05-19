import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

export interface ActivityLogPayload {
  workspaceId: string;
  projectId?: string | null;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  changes?: Prisma.InputJsonValue;
}

export class ActivityService {
  async logActivity(payload: ActivityLogPayload) {
    return prisma.activityLog.create({
      data: {
        workspaceId: payload.workspaceId,
        projectId: payload.projectId,
        userId: payload.userId,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadata: {
          entityName: payload.entityName ?? null,
          changes: payload.changes ?? {},
        } satisfies Prisma.InputJsonObject,
      },
    });
  }

  async getRecentActivity(workspaceId: string, limit: number = 20) {
    return prisma.activityLog.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const activityService = new ActivityService();
