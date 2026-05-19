import { Router, Request, Response } from 'express';
import { auth } from '../middleware/auth';
import { checkProjectMember, checkProjectMemberWithRole } from '../middleware/roles';
import { taskService } from '../services/task.service';
import { notificationService } from '../services/notification.service';
import { activityService } from '../services/activity.service';
import { prisma } from '../lib/prisma';
import { TaskStatus, Priority } from '@prisma/client';

const router: Router = Router();

async function getWorkspaceIdForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  return project.workspaceId;
}

// Create task
router.post('/', auth, checkProjectMemberWithRole('MEMBER'), async (req: Request, res: Response) => {
  try {
    const { projectId, title, description, priority, dueDate, labels, assigneeId } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const task = await taskService.createTask(projectId, userId, {
      title,
      description,
      priority: priority || Priority.P2,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      labels: labels || [],
      assigneeId,
    });

    const workspaceId = await getWorkspaceIdForProject(projectId);

    // Log activity
    await activityService.logActivity({
      workspaceId,
      projectId,
      userId,
      action: 'created',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
    });

    // Notify assignee if assigned
    if (assigneeId && assigneeId !== userId) {
      await notificationService.notifyTaskAssignee(assigneeId, task.id, task.title, 'assigned');
    }

    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Get task by ID
router.get('/:taskId', auth, checkProjectMember, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Update task
router.put('/:taskId', auth, checkProjectMemberWithRole('MEMBER'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { title, description, status, priority, assigneeId, dueDate, labels } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const oldTask = await taskService.getTaskById(taskId);
    if (!oldTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await taskService.updateTask(taskId, {
      title,
      description,
      status: status as TaskStatus,
      priority: priority as Priority,
      assigneeId: assigneeId === null ? null : assigneeId,
      dueDate: dueDate ? new Date(dueDate) : null,
      labels,
    });

    const workspaceId = await getWorkspaceIdForProject(oldTask.projectId);

    // Log activity
    await activityService.logActivity({
      workspaceId,
      projectId: oldTask.projectId,
      userId,
      action: 'updated',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
      changes: {
        before: {
          status: oldTask.status,
          assigneeId: oldTask.assigneeId,
          priority: oldTask.priority,
        },
        after: {
          status: task.status,
          assigneeId: task.assigneeId,
          priority: task.priority,
        },
      },
    });

    // Notify if assigned and changed
    if (assigneeId && assigneeId !== oldTask.assigneeId && assigneeId !== userId) {
      await notificationService.notifyTaskAssignee(assigneeId, task.id, task.title, 'assigned');
    }

    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:taskId', auth, checkProjectMemberWithRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await taskService.deleteTask(taskId);

    const workspaceId = await getWorkspaceIdForProject(task.projectId);

    // Log activity
    await activityService.logActivity({
      workspaceId,
      projectId: task.projectId,
      userId,
      action: 'deleted',
      entityType: 'task',
      entityId: task.id,
      entityName: task.title,
    });

    res.json({ message: 'Task deleted' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get all tasks for project
router.get('/', auth, checkProjectMember, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const tasks = await taskService.listTasksByProject(projectId as string);
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Move task (reorder)
router.put('/:taskId/move', auth, checkProjectMemberWithRole('MEMBER'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { status, order } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const oldTask = await taskService.getTaskById(taskId);
    if (!oldTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = await taskService.moveTask(taskId, status as TaskStatus, order);

    const workspaceId = await getWorkspaceIdForProject(oldTask.projectId);

    // Log activity
    if (oldTask.status !== status) {
      await activityService.logActivity({
        workspaceId,
        projectId: oldTask.projectId,
        userId,
        action: 'moved',
        entityType: 'task',
        entityId: task.id,
        entityName: task.title,
        changes: { from: oldTask.status, to: status },
      });
    }

    res.json(task);
  } catch (error) {
    console.error('Error moving task:', error);
    res.status(500).json({ error: 'Failed to move task' });
  }
});

// Create comment
router.post('/:taskId/comments', auth, checkProjectMemberWithRole('MEMBER'), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const { content, mentions } = req.body;
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const comment = await taskService.createComment(taskId, userId, content, mentions || []);

    // Notify mentioned users
    const task = await taskService.getTaskById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (mentions && mentions.length > 0) {
      await notificationService.notifyMentionedUsers(
        taskId,
        mentions,
        req.user?.email || 'Someone',
        task.title
      );
    }

    const workspaceId = await getWorkspaceIdForProject(task.projectId);

    // Log activity
    await activityService.logActivity({
      workspaceId,
      projectId: task.projectId,
      userId,
      action: 'commented',
      entityType: 'task',
      entityId: taskId,
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error('Error creating comment:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// Get comments
router.get('/:taskId/comments', auth, checkProjectMember, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const comments = await taskService.getComments(taskId);
    res.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// Delete comment
router.delete('/:taskId/comments/:commentId', auth, checkProjectMemberWithRole('MEMBER'), async (req: Request, res: Response) => {
  try {
    const { commentId } = req.params;

    await taskService.deleteComment(commentId);
    res.json({ message: 'Comment deleted' });
  } catch (error) {
    console.error('Error deleting comment:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

export default router;
