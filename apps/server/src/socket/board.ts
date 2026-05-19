import { Server as SocketIOServer, Socket } from 'socket.io';
import { taskService } from '../services/task.service';
import { activityService } from '../services/activity.service';
import { notificationService } from '../services/notification.service';
import { TaskStatus, Priority } from '@prisma/client';

export function setupBoardSocket(io: SocketIOServer) {
  io.on('connection', (socket: Socket) => {
    // Join board room
    socket.on('board:join', async (data: { projectId: string; userId: string }) => {
      try {
        const { projectId, userId } = data;
        const roomName = `project:${projectId}`;

        socket.join(roomName);
        console.log(`User ${userId} joined board ${projectId}`);

        // Broadcast updated viewer list to all in room
        io.to(roomName).emit('board:viewers:updated', {
          projectId,
          viewer: { id: userId, joinedAt: new Date() },
        });
      } catch (error) {
        console.error('Error joining board:', error);
        socket.emit('error', { message: 'Failed to join board' });
      }
    });

    // Leave board room
    socket.on('board:leave', async (data: { projectId: string; userId: string }) => {
      try {
        const { projectId, userId } = data;
        const roomName = `project:${projectId}`;

        socket.leave(roomName);
        console.log(`User ${userId} left board ${projectId}`);

        io.to(roomName).emit('board:viewers:updated', {
          projectId,
          viewerLeft: userId,
        });
      } catch (error) {
        console.error('Error leaving board:', error);
      }
    });

    // Task moved (drag-drop)
    socket.on(
      'task:move',
      async (data: {
        taskId: string;
        projectId: string;
        newStatus: TaskStatus;
        newOrder: number;
        userId: string;
        workspaceId: string;
      }) => {
        try {
          const { taskId, projectId, newStatus, newOrder, userId, workspaceId } = data;

          // Update in database
          const task = await taskService.moveTask(taskId, newStatus, newOrder);

          // Log activity
          await activityService.logActivity({
            workspaceId,
            projectId,
            userId,
            action: 'moved',
            entityType: 'task',
            entityId: taskId,
            entityName: task.title,
            changes: { to: newStatus },
          });

          // Broadcast to all board viewers
          const roomName = `project:${projectId}`;
          io.to(roomName).emit('task:move:ack', {
            taskId,
            newStatus,
            newOrder,
            updatedAt: new Date(),
            movedBy: userId,
          });
        } catch (error) {
          console.error('Error moving task:', error);
          socket.emit('error', { message: 'Failed to move task' });
        }
      }
    );

    // Task updated (title, desc, priority, assignee, etc.)
    socket.on(
      'task:update',
      async (data: {
        taskId: string;
        projectId: string;
        updates: {
          title?: string;
          description?: string;
          priority?: Priority;
          assigneeId?: string | null;
          dueDate?: Date;
          labels?: string[];
        };
        userId: string;
        workspaceId: string;
      }) => {
        try {
          const { taskId, projectId, updates, userId, workspaceId } = data;

          const oldTask = await taskService.getTaskById(taskId);
          if (!oldTask) {
            socket.emit('error', { message: 'Task not found' });
            return;
          }

          // Update in database
          const task = await taskService.updateTask(taskId, updates);

          // Log activity
          await activityService.logActivity({
            workspaceId,
            projectId,
            userId,
            action: 'updated',
            entityType: 'task',
            entityId: taskId,
            entityName: task.title,
            changes: {
              before: {
                title: oldTask.title,
                priority: oldTask.priority,
                assigneeId: oldTask.assigneeId,
              },
              after: {
                title: task.title,
                priority: task.priority,
                assigneeId: task.assigneeId,
              },
            },
          });

          // Notify if assigned to someone new
          if (updates.assigneeId && updates.assigneeId !== oldTask.assigneeId) {
            await notificationService.notifyTaskAssignee(
              updates.assigneeId,
              taskId,
              task.title,
              'assigned'
            );
          }

          // Broadcast update to all board viewers
          const roomName = `project:${projectId}`;
          io.to(roomName).emit('task:update:ack', {
            taskId,
            updates,
            updatedAt: new Date(),
            updatedBy: userId,
          });
        } catch (error) {
          console.error('Error updating task:', error);
          socket.emit('error', { message: 'Failed to update task' });
        }
      }
    );

    // New comment
    socket.on(
      'task:comment:new',
      async (data: {
        taskId: string;
        projectId: string;
        content: string;
        mentions: string[];
        userId: string;
        userName: string;
        workspaceId: string;
      }) => {
        try {
          const { taskId, projectId, content, mentions, userId, userName, workspaceId } = data;

          // Create comment in database
          const comment = await taskService.createComment(taskId, userId, content, mentions);

          // Notify mentioned users
          if (mentions.length > 0) {
            const task = await taskService.getTaskById(taskId);
            if (!task) {
              socket.emit('error', { message: 'Task not found' });
              return;
            }
            await notificationService.notifyMentionedUsers(
              taskId,
              mentions,
              userName,
              task.title
            );
          }

          // Log activity
          await activityService.logActivity({
            workspaceId,
            projectId,
            userId,
            action: 'commented',
            entityType: 'task',
            entityId: taskId,
          });

          // Broadcast to task detail viewers
          const taskRoomName = `task:${taskId}`;
          io.to(taskRoomName).emit('task:comment:new', {
            comment,
            taskId,
            addedBy: userId,
          });

          // Also broadcast to board for activity
          const boardRoomName = `project:${projectId}`;
          io.to(boardRoomName).emit('task:activity:new', {
            action: 'commented',
            taskId,
            userName,
          });
        } catch (error) {
          console.error('Error creating comment:', error);
          socket.emit('error', { message: 'Failed to create comment' });
        }
      }
    );

    // Join task detail view
    socket.on('task:view:join', async (data: { taskId: string; userId: string }) => {
      try {
        const { taskId, userId } = data;
        const roomName = `task:${taskId}`;

        socket.join(roomName);
        console.log(`User ${userId} viewing task ${taskId}`);

        // Notify other viewers
        io.to(roomName).emit('task:view:user:joined', { userId });
      } catch (error) {
        console.error('Error joining task view:', error);
      }
    });

    // Leave task detail view
    socket.on('task:view:leave', async (data: { taskId: string; userId: string }) => {
      try {
        const { taskId, userId } = data;
        const roomName = `task:${taskId}`;

        socket.leave(roomName);
        console.log(`User ${userId} left task view ${taskId}`);

        io.to(roomName).emit('task:view:user:left', { userId });
      } catch (error) {
        console.error('Error leaving task view:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket ${socket.id} disconnected`);
    });
  });
}
