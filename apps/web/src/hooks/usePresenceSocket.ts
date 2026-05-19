import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useUser } from '@/hooks/useAuth'; // Assuming this hook exists

let socket: Socket | null = null;

interface Viewer {
  id: string;
  name: string;
  avatar?: string;
  viewingTaskId?: string;
}

export const usePresenceSocket = (projectId: string) => {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const user = useUser();

  useEffect(() => {
    if (!projectId || !user?.id) return;

    // Initialize Socket.IO connection if not already initialized
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000', {
        reconnection: true,
      });
    }

    // Join presence
    socket.emit('presence:join', {
      projectId,
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatar,
    });

    // Listen for presence updates
    const handlePresenceUpdate = (data: any) => {
      if (data.projectId === projectId) {
        setViewers(data.viewers.filter((v: Viewer) => v.id !== user.id)); // Don't include self
      }
    };

    socket.on('presence:updated', handlePresenceUpdate);

    // Heartbeat to keep presence alive
    const heartbeatInterval = setInterval(() => {
      socket?.emit('presence:heartbeat', { projectId, userId: user.id });
    }, 30000); // Every 30 seconds

    // Cleanup on unmount
    return () => {
      clearInterval(heartbeatInterval);
      if (socket) {
        socket.emit('presence:leave', { projectId, userId: user.id });
        socket.off('presence:updated', handlePresenceUpdate);
      }
    };
  }, [projectId, user?.id, user?.name, user?.avatar]);

  const updateViewingTask = (taskId?: string) => {
    if (socket && user?.id) {
      if (taskId) {
        socket.emit('presence:viewing-task', {
          projectId,
          taskId,
          userId: user.id,
          userName: user.name,
        });
      } else {
        socket.emit('presence:stop-viewing-task', {
          projectId,
          taskId: undefined,
          userId: user.id,
        });
      }
    }
  };

  return { viewers, updateViewingTask };
};
