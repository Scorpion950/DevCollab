import { prisma } from '../lib/prisma';
import { Notification, NotificationType } from '@prisma/client';
import { io } from '../index';
import { sendNotificationToUser } from '../socket/notifications';

export class NotificationService {
  // Create notification
  async createNotification(
    userId: string,
    type: NotificationType,
    message: string,
    link?: string
  ): Promise<Notification> {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        message,
        link,
        read: false,
      },
    });

    // Emit real-time notification
    sendNotificationToUser(io, userId, notification).catch((err) => 
      console.error('Failed to emit notification socket:', err)
    );

    return notification;
  }

  // Get user notifications
  async getUserNotifications(userId: string, limit: number = 10) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Get unread count
  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // Mark as read
  async markAsRead(notificationId: string): Promise<Notification> {
    return prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  // Mark all as read
  async markAllAsRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  // Delete notification
  async deleteNotification(notificationId: string) {
    return prisma.notification.delete({ where: { id: notificationId } });
  }

  // Bulk create for mentioned users
  async notifyMentionedUsers(taskId: string, mentions: string[], authorName: string, taskTitle: string) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: { in: mentions } },
          { name: { in: mentions } },
        ],
      },
      select: { id: true },
    });

    const notifications = users.map((user) =>
      prisma.notification.create({
        data: {
          userId: user.id,
          type: 'COMMENT_MENTION',
          message: `${authorName} mentioned you in "${taskTitle}"`,
          link: `/board?taskId=${taskId}`,
        },
      })
    );

    if (notifications.length === 0) {
      return [];
    }

    return prisma.$transaction(notifications);
  }

  // Notify assignee
  async notifyTaskAssignee(
    assigneeId: string,
    taskId: string,
    taskTitle: string,
    action: 'assigned' | 'moved' = 'assigned'
  ) {
    const messages: Record<string, string> = {
      assigned: `You were assigned to: ${taskTitle}`,
      moved: `Task "${taskTitle}" was moved`,
    };

    return this.createNotification(
      assigneeId,
      'TASK_ASSIGNED',
      messages[action],
      `/board?taskId=${taskId}`
    );
  }

  // Clean old notifications (keep last 50)
  async cleanOldNotifications(userId: string, keepCount: number = 50) {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: keepCount,
      select: { id: true },
    });

    if (notifications.length > 0) {
      return prisma.notification.deleteMany({
        where: { id: { in: notifications.map((n) => n.id) } },
      });
    }
  }
}

export const notificationService = new NotificationService();
