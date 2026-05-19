import { prisma } from '../lib/prisma';
import { Task, TaskComment, TaskStatus, Priority } from '@prisma/client';

export class TaskService {
  // Create task
  async createTask(
    projectId: string,
    userId: string,
    data: {
      title: string;
      description?: string;
      priority?: Priority;
      dueDate?: Date;
      labels?: string[];
      assigneeId?: string;
    }
  ): Promise<Task> {
    // Get max order for new task
    const maxOrder = await prisma.task.aggregate({
      where: { projectId, status: 'TODO' },
      _max: { order: true },
    });

    return prisma.task.create({
      data: {
        ...data,
        projectId,
        reporterId: userId,
        status: 'TODO',
        order: (maxOrder._max.order ?? -1) + 1,
        labels: data.labels || [],
      },
      include: {
        assignee: { select: { id: true, name: true, avatar: true, email: true } },
        reporter: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  // Get task by ID
  async getTaskById(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, name: true, avatar: true, email: true } },
        reporter: { select: { id: true, name: true, avatar: true } },
        comments: {
          include: { author: { select: { id: true, name: true, avatar: true } } },
          orderBy: { createdAt: 'asc' },
        },
        attachments: { select: { id: true, url: true, filename: true, fileSize: true, mimeType: true } },
      },
    });
  }

  // Update task
  async updateTask(
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: TaskStatus;
      priority?: Priority;
      assigneeId?: string | null;
      dueDate?: Date | null;
      labels?: string[];
    }
  ) {
    return prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true, avatar: true, email: true } },
        reporter: { select: { id: true, name: true, avatar: true } },
      },
    });
  }

  // Delete task
  async deleteTask(taskId: string) {
    return prisma.task.delete({ where: { id: taskId } });
  }

  // Get all tasks for project
  async listTasksByProject(projectId: string) {
    return prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { id: true, name: true, avatar: true, email: true } },
        reporter: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: [{ status: 'asc' }, { order: 'asc' }],
    });
  }

  // Reorder task (drag-drop)
  async moveTask(taskId: string, newStatus: TaskStatus, newOrder: number) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new Error('Task not found');

    // Get all tasks in new status
    const tasksInNewStatus = await prisma.task.findMany({
      where: { projectId: task.projectId, status: newStatus },
      orderBy: { order: 'asc' },
    });

    // Update orders for affected tasks
    const updates = tasksInNewStatus
      .filter((t) => t.order >= newOrder)
      .map((t) => prisma.task.update({ where: { id: t.id }, data: { order: t.order + 1 } }));

    await prisma.$transaction(updates);

    return prisma.task.update({
      where: { id: taskId },
      data: { status: newStatus, order: newOrder },
      include: {
        assignee: { select: { id: true, name: true, avatar: true, email: true } },
      },
    });
  }

  // Create comment
  async createComment(taskId: string, userId: string, content: string, mentions: string[] = []) {
    return prisma.taskComment.create({
      data: {
        taskId,
        authorId: userId,
        content,
        mentions,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true, email: true } },
      },
    });
  }

  // Get comments for task
  async getComments(taskId: string) {
    return prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: { select: { id: true, name: true, avatar: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // Delete comment
  async deleteComment(commentId: string) {
    return prisma.taskComment.delete({ where: { id: commentId } });
  }

  // Get task changes (for activity log)
  async getTaskChanges(taskId: string, limit: number = 10) {
    return prisma.activityLog.findMany({
      where: {
        entityId: taskId,
        entityType: 'task',
      },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const taskService = new TaskService();
