import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from '@/hooks/useAuth'; // Assuming this hook exists

let socket: Socket | null = null;

interface NotificationSocketCallbacks {
  onNotificationNew?: (notification: any) => void;
  onNotificationRead?: (notificationId: string) => void;
  onNotificationDelete?: (notificationId: string) => void;
  onAllRead?: () => void;
}

export const useNotificationSocket = (callbacks: NotificationSocketCallbacks) => {
  const user = useUser();

  useEffect(() => {
    if (!user?.id) return;

    // Initialize Socket.IO connection if not already initialized
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000', {
        reconnection: true,
      });
    }

    // Subscribe to notifications
    socket.emit('notification:subscribe', { userId: user.id });

    // Listen for new notifications
    const handleNewNotification = (notification: any) => {
      callbacks.onNotificationNew?.(notification);
    };
    const handleRead = ({ notificationId }: { notificationId: string }) => {
      callbacks.onNotificationRead?.(notificationId);
    };
    const handleDeleted = ({ notificationId }: { notificationId: string }) => {
      callbacks.onNotificationDelete?.(notificationId);
    };
    const handleAllRead = () => {
      callbacks.onAllRead?.();
    };

    socket.on('notification:new', handleNewNotification);
    socket.on('notification:read', handleRead);
    socket.on('notification:deleted', handleDeleted);
    socket.on('notification:all-read', handleAllRead);

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.emit('notification:unsubscribe', { userId: user.id });
        socket.off('notification:new', handleNewNotification);
        socket.off('notification:read', handleRead);
        socket.off('notification:deleted', handleDeleted);
        socket.off('notification:all-read', handleAllRead);
      }
    };
  }, [user?.id, callbacks]);

  return {
    onNotificationNew: callbacks.onNotificationNew,
    onNotificationRead: callbacks.onNotificationRead,
    onNotificationDelete: callbacks.onNotificationDelete,
    onAllRead: callbacks.onAllRead,
  };
};
