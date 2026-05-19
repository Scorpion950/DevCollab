import React from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { NotificationItem } from './NotificationItem';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCheck } from 'lucide-react';

interface NotificationDropdownProps {
  onNotificationClick?: () => void;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  onNotificationClick,
}) => {
  const { notifications, isLoading, markAllAsRead } = useNotifications();

  const unreadNotifications = notifications.filter((n) => !n.read);

  return (
    <div className="flex flex-col max-h-96">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-primary">Notifications</h3>
        {unreadNotifications.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={markAllAsRead}
            className="text-xs gap-1"
          >
            <CheckCheck className="w-3 h-3" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notifications List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="px-4 py-8 text-center text-text-muted">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center text-text-muted">No notifications</div>
        ) : (
          <div className="divide-y divide-border">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClick={onNotificationClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
