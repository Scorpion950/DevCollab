import { Server as SocketIOServer, Socket } from 'socket.io';
import { presenceService } from '../services/presence.service';

export function setupPresenceSocket(io: SocketIOServer) {
  // Cleanup stale presence every 5 minutes
  setInterval(async () => {
    try {
      await presenceService.cleanStalePresence(5);
      console.log('Cleaned stale presence records');
    } catch (error) {
      console.error('Error cleaning stale presence:', error);
    }
  }, 5 * 60 * 1000);

  io.on('connection', (socket: Socket) => {
    // User joins board
    socket.on(
      'presence:join',
      async (data: {
        projectId: string;
        userId: string;
        userName: string;
        userAvatar?: string;
        viewingTaskId?: string;
      }) => {
        try {
          const { projectId, userId, userName, userAvatar, viewingTaskId } = data;

          // Update presence in database
          await presenceService.joinBoard(userId, projectId, viewingTaskId);

          // Get all current viewers
          const viewers = await presenceService.getProjectViewers(projectId);

          // Broadcast updated viewer list to room
          const roomName = `project:${projectId}`;
          io.to(roomName).emit('presence:updated', {
            projectId,
            viewers: viewers.map((v) => ({
              id: v.userId,
              name: v.user.name,
              avatar: v.user.avatar,
              viewingTaskId: v.viewingTaskId,
            })),
          });

          console.log(`User ${userId} joined board ${projectId}, now ${viewers.length} viewers`);
        } catch (error) {
          console.error('Error joining presence:', error);
          socket.emit('error', { message: 'Failed to join board' });
        }
      }
    );

    // User leaves board
    socket.on(
      'presence:leave',
      async (data: { projectId: string; userId: string }) => {
        try {
          const { projectId, userId } = data;

          // Remove from database
          await presenceService.leaveBoard(userId, projectId);

          // Get remaining viewers
          const viewers = await presenceService.getProjectViewers(projectId);

          // Broadcast updated viewer list
          const roomName = `project:${projectId}`;
          io.to(roomName).emit('presence:updated', {
            projectId,
            viewers: viewers.map((v) => ({
              id: v.userId,
              name: v.user.name,
              avatar: v.user.avatar,
              viewingTaskId: v.viewingTaskId,
            })),
          });

          console.log(`User ${userId} left board ${projectId}, now ${viewers.length} viewers`);
        } catch (error) {
          console.error('Error leaving presence:', error);
        }
      }
    );

    // User starts viewing a task
    socket.on(
      'presence:viewing-task',
      async (data: {
        projectId: string;
        taskId: string;
        userId: string;
        userName: string;
      }) => {
        try {
          const { projectId, taskId, userId, userName } = data;

          // Update presence
          await presenceService.joinBoard(userId, projectId, taskId);

          // Get all viewers for this task
          const taskViewers = await presenceService.getTaskViewers(taskId);

          // Broadcast to task room
          const taskRoomName = `task:${taskId}`;
          io.to(taskRoomName).emit('presence:task:updated', {
            taskId,
            viewers: taskViewers.map((v) => ({
              id: v.userId,
              name: v.user.name,
              avatar: v.user.avatar,
            })),
          });
        } catch (error) {
          console.error('Error updating task presence:', error);
        }
      }
    );

    // User stops viewing a task
    socket.on(
      'presence:stop-viewing-task',
      async (data: {
        projectId: string;
        taskId: string;
        userId: string;
      }) => {
        try {
          const { projectId, taskId, userId } = data;

          // Update presence (set viewingTaskId to null)
          await presenceService.joinBoard(userId, projectId, undefined);

          // Get updated viewers
          const taskViewers = await presenceService.getTaskViewers(taskId);

          // Broadcast update
          const taskRoomName = `task:${taskId}`;
          io.to(taskRoomName).emit('presence:task:updated', {
            taskId,
            viewers: taskViewers.map((v) => ({
              id: v.userId,
              name: v.user.name,
              avatar: v.user.avatar,
            })),
          });
        } catch (error) {
          console.error('Error stopping task presence:', error);
        }
      }
    );

    // Keep-alive / update last seen
    socket.on('presence:heartbeat', async (data: { projectId: string; userId: string }) => {
      try {
        const { projectId, userId } = data;
        await presenceService.updateLastSeen(userId, projectId);
      } catch (error) {
        console.error('Error updating heartbeat:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Presence socket ${socket.id} disconnected`);
    });
  });
}
