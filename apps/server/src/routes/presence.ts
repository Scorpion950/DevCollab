import { Router, Request, Response } from 'express';
import { auth } from '../middleware/auth';
import { presenceService } from '../services/presence.service';

const router: Router = Router();

// Get all viewers for project
router.get('/', auth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' });
    }

    const viewers = await presenceService.getProjectViewers(projectId as string);
    res.json(viewers);
  } catch (error) {
    console.error('Error fetching viewers:', error);
    res.status(500).json({ error: 'Failed to fetch viewers' });
  }
});

// Get viewers for specific task
router.get('/task/:taskId', auth, async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    const viewers = await presenceService.getTaskViewers(taskId);
    res.json(viewers);
  } catch (error) {
    console.error('Error fetching task viewers:', error);
    res.status(500).json({ error: 'Failed to fetch task viewers' });
  }
});

// Join board
router.post('/join', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { projectId, viewingTaskId } = req.body;

    const presence = await presenceService.joinBoard(userId, projectId, viewingTaskId);
    res.status(201).json(presence);
  } catch (error) {
    console.error('Error joining board:', error);
    res.status(500).json({ error: 'Failed to join board' });
  }
});

// Leave board
router.post('/leave', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { projectId } = req.body;

    await presenceService.leaveBoard(userId, projectId);
    res.json({ message: 'Left board' });
  } catch (error) {
    console.error('Error leaving board:', error);
    res.status(500).json({ error: 'Failed to leave board' });
  }
});

// Update last seen
router.put('/update-seen', auth, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { projectId } = req.body;

    await presenceService.updateLastSeen(userId, projectId);
    res.json({ message: 'Updated' });
  } catch (error) {
    console.error('Error updating last seen:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

export default router;
