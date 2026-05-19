import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useBoardStore } from '@/store/board.store';
import { useUser } from '@/hooks/useAuth';

let socket: Socket | null = null;

export const useBoardSocket = (projectId: string, workspaceId: string) => {
  const { updateTask, moveTask } = useBoardStore();
  const user = useUser();

  useEffect(() => {
    if (!projectId || !user?.id) return;

    // Initialize Socket.IO connection if not already initialized
    if (!socket) {
      socket = io(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:4000', {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
      });
    }

    // Join board room
    socket.emit('board:join', { projectId, userId: user.id });

    // Listen for task updates
    const handleMoveAck = (data: any) => {
      moveTask(data.taskId, data.newStatus, data.newOrder);
    };
    const handleUpdateAck = (data: any) => {
      updateTask(data.taskId, data.updates);
    };

    socket.on('task:move:ack', handleMoveAck);
    socket.on('task:update:ack', handleUpdateAck);

    // Cleanup on unmount
    return () => {
      if (socket) {
        socket.emit('board:leave', { projectId, userId: user.id });
        socket.off('task:move:ack', handleMoveAck);
        socket.off('task:update:ack', handleUpdateAck);
      }
    };
  }, [projectId, user?.id, updateTask, moveTask]);

  const moveTaskSocket = (taskId: string, newStatus: string, newOrder: number) => {
    if (socket) {
      socket.emit('task:move', {
        taskId,
        projectId,
        newStatus,
        newOrder,
        userId: user?.id,
        workspaceId,
      });
    }
  };

  const updateTaskSocket = (taskId: string, updates: any) => {
    if (socket) {
      socket.emit('task:update', {
        taskId,
        projectId,
        updates,
        userId: user?.id,
        workspaceId,
      });
    }
  };

  return { moveTaskSocket, updateTaskSocket };
};
