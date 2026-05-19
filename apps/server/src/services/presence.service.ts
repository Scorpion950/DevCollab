import { prisma } from '../lib/prisma';
import { Presence } from '@prisma/client';

export class PresenceService {
  // User joins board
  async joinBoard(userId: string, projectId: string, viewingTaskId?: string): Promise<Presence> {
    return prisma.presence.upsert({
      where: { userId_projectId: { userId, projectId } },
      update: {
        viewingTaskId,
        updatedAt: new Date(),
        lastSeenAt: new Date(),
      },
      create: {
        userId,
        projectId,
        viewingTaskId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  // User leaves board
  async leaveBoard(userId: string, projectId: string) {
    return prisma.presence.delete({
      where: { userId_projectId: { userId, projectId } },
    });
  }

  // Get all viewers for project
  async getProjectViewers(projectId: string) {
    return prisma.presence.findMany({
      where: { projectId },
      include: {
        user: { select: { id: true, name: true, avatar: true, email: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  // Get viewers for specific task
  async getTaskViewers(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true },
    });

    if (!task) return [];

    return prisma.presence.findMany({
      where: {
        projectId: task.projectId,
        viewingTaskId: taskId,
      },
      include: {
        user: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  // Update last seen (for stale detection)
  async updateLastSeen(userId: string, projectId: string) {
    return prisma.presence.update({
      where: { userId_projectId: { userId, projectId } },
      data: { lastSeenAt: new Date() },
    });
  }

  // Clean stale presence (older than X minutes)
  async cleanStalePresence(minutesThreshold: number = 5) {
    const cutoffTime = new Date(Date.now() - minutesThreshold * 60 * 1000);

    return prisma.presence.deleteMany({
      where: {
        lastSeenAt: { lt: cutoffTime },
      },
    });
  }

  // Check if user is viewing
  async isUserViewing(userId: string, projectId: string): Promise<boolean> {
    const presence = await prisma.presence.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    return !!presence;
  }
}

export const presenceService = new PresenceService();
