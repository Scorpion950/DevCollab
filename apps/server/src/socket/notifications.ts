import { Server as SocketIOServer, Socket } from 'socket.io';
import { notificationService } from '../services/notification.service';

export function setupNotificationSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    // User joins their notification channel
    socket.on('notification:subscribe', (data: { userId: string }) => {
      try {
        const { userId } = data;
        const roomName = `user:${userId}`;

        socket.join(roomName);
        console.log(`User ${userId} subscribed to notifications`);
      } catch (error) {
        console.error('Error subscribing to notifications:', error);
      }
    });

    // User leaves their notification channel
    socket.on('notification:unsubscribe', (data: { userId: string }) => {
      try {
        const { userId } = data;
        const roomName = `user:${userId}`;

        socket.leave(roomName);
        console.log(`User ${userId} unsubscribed from notifications`);
      } catch (error) {
        console.error('Error unsubscribing from notifications:', error);
      }
    });

    // Mark notification as read
    socket.on('notification:mark-read', async (data: { notificationId: string; userId: string }) => {
      try {
        const { notificationId, userId } = data;

        await notificationService.markAsRead(notificationId);

        // Broadcast to user's channel
        const roomName = `user:${userId}`;
        io.to(roomName).emit('notification:read', { notificationId });
      } catch (error) {
        console.error('Error marking notification as read:', error);
        socket.emit('error', { message: 'Failed to mark as read' });
      }
    });

    // Mark all as read
    socket.on('notification:mark-all-read', async (data: { userId: string }) => {
      try {
        const { userId } = data;

        await notificationService.markAllAsRead(userId);

        // Broadcast to user's channel
        const roomName = `user:${userId}`;
        io.to(roomName).emit('notification:all-read');
      } catch (error) {
        console.error('Error marking all as read:', error);
        socket.emit('error', { message: 'Failed to mark all as read' });
      }
    });

    // Delete notification
    socket.on('notification:delete', async (data: { notificationId: string; userId: string }) => {
      try {
        const { notificationId, userId } = data;

        await notificationService.deleteNotification(notificationId);

        // Broadcast to user's channel
        const roomName = `user:${userId}`;
        io.to(roomName).emit('notification:deleted', { notificationId });
      } catch (error) {
        console.error('Error deleting notification:', error);
        socket.emit('error', { message: 'Failed to delete notification' });
      }
    });

    // Unread count subscription
    socket.on('notification:get-count', async (data: { userId: string }) => {
      try {
        const { userId } = data;

        const unreadCount = await notificationService.getUnreadCount(userId);
        socket.emit('notification:count', { unreadCount });
      } catch (error) {
        console.error('Error getting unread count:', error);
      }
    });
  });
}

// Helper: Send notification to user via Socket.IO
export async function sendNotificationToUser(
  io: SocketIOServer,
  userId: string,
  notification: {
    id: string;
    type: string;
    message: string;
    link?: string;
  }
) {
  const roomName = `user:${userId}`;
  io.to(roomName).emit('notification:new', notification);
}
