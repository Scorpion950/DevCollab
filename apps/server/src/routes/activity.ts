import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middleware/auth";

const router: Router = Router();

// =============================================
// ACTIVITY LOG ROUTES
// =============================================

/**
 * GET /api/activity?workspaceId=X&projectId=Y&userId=Z&limit=20&offset=0
 * Get activity feed (paginated, can be filtered by project or user)
 */
router.get("/", auth, async (req: Request, res: Response) => {
  try {
    const { workspaceId, projectId, userId } = req.query;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    if (!workspaceId || typeof workspaceId !== "string") {
      return res.status(400).json({ error: "workspaceId is required" });
    }

    // Check if user has access to this workspace
    const workspaceMember = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: req.user!.userId,
        },
      },
    });

    if (!workspaceMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build where clause
    const where: any = { workspaceId };

    if (projectId && typeof projectId === "string") {
      where.projectId = projectId;
    }

    if (userId && typeof userId === "string") {
      where.userId = userId;
    }

    // Get total count
    const total = await prisma.activityLog.count({ where });

    // Get paginated results
    const activities = await prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, avatar: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });

    // Group by date
    const grouped: Record<string, typeof activities> = {};
    activities.forEach((activity) => {
      const date = activity.createdAt.toLocaleDateString();
      if (!grouped[date]) grouped[date] = [];
      grouped[date].push(activity);
    });

    res.json({
      total,
      limit,
      offset,
      activities: grouped,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch activity feed" });
  }
});

export default router;
