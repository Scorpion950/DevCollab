import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middleware/auth";
import { body, validationResult } from "express-validator";

const router: Router = Router();

const validateRequest = (req: Request, res: Response, next: () => void) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Validation failed", details: errors.array() });
  }
  next();
};

// =============================================
// SNIPPET ROUTES
// =============================================

/**
 * GET /api/snippets?projectId=X&q=search&tags=tag1,tag2
 * List all snippets (with search and tag filter)
 */
router.get("/", auth, async (req: Request, res: Response) => {
  try {
    const { projectId, q, tags } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    // Check if user has access to this project
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Build query filters
    const where: any = { projectId };

    if (q && typeof q === "string") {
      where.OR = [{ title: { search: q } }, { description: { search: q } }, { code: { search: q } }];
    }

    if (tags && typeof tags === "string") {
      const tagArray = tags.split(",").map((t) => t.trim());
      where.tags = { hasSome: tagArray };
    }

    const snippets = await prisma.snippet.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        language: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(snippets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch snippets" });
  }
});

/**
 * GET /api/snippets/:snippetId
 * Get single snippet
 */
router.get("/:snippetId", auth, async (req: Request, res: Response) => {
  try {
    const { snippetId } = req.params;

    const snippet = await prisma.snippet.findUnique({
      where: { id: snippetId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (!snippet) {
      return res.status(404).json({ error: "Snippet not found" });
    }

    // Check access
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: snippet.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(snippet);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch snippet" });
  }
});

/**
 * POST /api/snippets
 * Create snippet
 */
router.post(
  "/",
  auth,
  [
    body("projectId").isString(),
    body("title").isString().notEmpty(),
    body("language").isString().notEmpty(),
    body("code").isString().notEmpty(),
    body("description").optional().isString(),
    body("tags").optional().isArray(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { projectId, title, language, code, description = "", tags = [] } = req.body;

      // Check if user is a project member
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: req.user!.userId,
          },
        },
      });

      if (!projectMember || projectMember.role === "VIEWER") {
        return res.status(403).json({ error: "Access denied" });
      }

      const snippet = await prisma.snippet.create({
        data: {
          title,
          language,
          code,
          description,
          tags,
          projectId,
          authorId: req.user!.userId,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      // Log activity
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      await prisma.activityLog.create({
        data: {
          workspaceId: project?.workspaceId || "",
          projectId,
          userId: req.user!.userId,
          action: "created",
          entityType: "snippet",
          entityId: snippet.id,
          entityName: title,
        },
      });

      res.status(201).json(snippet);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create snippet" });
    }
  }
);

/**
 * PUT /api/snippets/:snippetId
 * Update snippet
 */
router.put(
  "/:snippetId",
  auth,
  [
    body("title").optional().isString(),
    body("language").optional().isString(),
    body("code").optional().isString(),
    body("description").optional().isString(),
    body("tags").optional().isArray(),
  ],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { snippetId } = req.params;
      const { title, language, code, description, tags } = req.body;

      const snippet = await prisma.snippet.findUnique({ where: { id: snippetId } });

      if (!snippet) {
        return res.status(404).json({ error: "Snippet not found" });
      }

      // Check access - only author or admin/owner can edit
      if (snippet.authorId !== req.user!.userId) {
        const projectMember = await prisma.projectMember.findUnique({
          where: {
            projectId_userId: {
              projectId: snippet.projectId,
              userId: req.user!.userId,
            },
          },
        });

        if (!projectMember || (projectMember.role !== "ADMIN" && projectMember.role !== "OWNER")) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const updatedSnippet = await prisma.snippet.update({
        where: { id: snippetId },
        data: {
          title: title !== undefined ? title : snippet.title,
          language: language !== undefined ? language : snippet.language,
          code: code !== undefined ? code : snippet.code,
          description: description !== undefined ? description : snippet.description,
          tags: tags !== undefined ? tags : snippet.tags,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      // Log activity
      const project = await prisma.project.findUnique({ where: { id: snippet.projectId } });
      await prisma.activityLog.create({
        data: {
          workspaceId: project?.workspaceId || "",
          projectId: snippet.projectId,
          userId: req.user!.userId,
          action: "updated",
          entityType: "snippet",
          entityId: snippetId,
          entityName: updatedSnippet.title,
        },
      });

      res.json(updatedSnippet);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update snippet" });
    }
  }
);

/**
 * DELETE /api/snippets/:snippetId
 * Delete snippet
 */
router.delete("/:snippetId", auth, async (req: Request, res: Response) => {
  try {
    const { snippetId } = req.params;

    const snippet = await prisma.snippet.findUnique({ where: { id: snippetId } });

    if (!snippet) {
      return res.status(404).json({ error: "Snippet not found" });
    }

    // Check access - only author or admin/owner can delete
    if (snippet.authorId !== req.user!.userId) {
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: snippet.projectId,
            userId: req.user!.userId,
          },
        },
      });

      if (!projectMember || (projectMember.role !== "ADMIN" && projectMember.role !== "OWNER")) {
        return res.status(403).json({ error: "Access denied" });
      }
    }

    await prisma.snippet.delete({ where: { id: snippetId } });

    // Log activity
    const project = await prisma.project.findUnique({ where: { id: snippet.projectId } });
    await prisma.activityLog.create({
      data: {
        workspaceId: project?.workspaceId || "",
        projectId: snippet.projectId,
        userId: req.user!.userId,
        action: "deleted",
        entityType: "snippet",
        entityId: snippetId,
        entityName: snippet.title,
      },
    });

    res.json({ message: "Snippet deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete snippet" });
  }
});

export default router;
