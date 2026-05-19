import React from 'react';
import { Notification } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

interface NotificationItemProps {
  notification: Notification;
  onClick?: () => void;
}

const notificationIcons: Record<string, string> = {
  TASK_ASSIGNED: '📋',
  TASK_MOVED: '➡️',
  COMMENT_MENTION: '💬',
  DOC_UPDATED: '📄',
  MEMBER_JOINED: '👤',
  INVITE_ACCEPTED: '✅',
};

export const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onClick,
}) => {
  const { markAsRead, deleteNotification } = useNotifications();
  const router = useRouter();

  const handleClick = async () => {
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    if (notification.link) {
      router.push(notification.link);
    }

    onClick?.();
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteNotification(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`px-4 py-3 hover:bg-surface-elevated cursor-pointer transition-colors flex items-start gap-3 ${
        !notification.read ? 'bg-primary/5' : ''
      }`}
    >
      {/* Icon */}
      <div className="text-lg">
        {notificationIcons[notification.type] || '🔔'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-primary line-clamp-2">{notification.message}</p>
        <p className="text-xs text-text-muted mt-1">
          {formatDistanceToNow(new Date(notification.createdAt), {
            addSuffix: true,
          })}
        </p>
      </div>

      {/* Delete Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleDelete}
        className="h-6 w-6 p-0 opacity-0 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </Button>

      {/* Unread Indicator */}
      {!notification.read && (
        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
      )}
    </div>
  );
};
