import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middleware/auth";
import { checkProjectMemberWithRole } from "../middleware/roles";
import { body, validationResult } from "express-validator";
import slugify from "slugify";

const router: Router = Router();

const validateRequest = (req: Request, res: Response, next: () => void) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: "Validation failed", details: errors.array() });
  }
  next();
};

// =============================================
// WIKI ROUTES
// =============================================

/**
 * GET /api/wiki?projectId=X
 * Get all wiki pages for a project (tree structure)
 */
router.get("/", auth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== "string") {
      return res.status(400).json({ error: "projectId is required" });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Check if user has access to this project
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get root pages (where parentId is null)
    const pages = await prisma.wikiPage.findMany({
      where: {
        projectId,
        parentId: null,
      },
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true, avatar: true } },
        children: {
          select: {
            id: true,
            title: true,
            slug: true,
            order: true,
            children: true,
          },
        },
      },
      orderBy: { order: "asc" },
    });

    res.json(pages);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch wiki pages" });
  }
});

/**
 * GET /api/wiki/:pageId
 * Get single page + latest version
 */
router.get("/:pageId", auth, async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;

    const page = await prisma.wikiPage.findUnique({
      where: { id: pageId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        project: true,
        versions: {
          select: { id: true, createdAt: true, author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check access
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: page.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(page);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch page" });
  }
});

/**
 * POST /api/wiki
 * Create new page
 */
router.post(
  "/",
  auth,
  checkProjectMemberWithRole("MEMBER"),
  [body("projectId").isString(), body("title").isString(), body("parentId").optional().isString()],
  async (req: Request, res: Response) => {
    try {
      const { projectId, title, parentId, content = "" } = req.body;
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Check if user is a project member and can create
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      if (!projectMember || projectMember.role === "VIEWER") {
        return res.status(403).json({ error: "Access denied" });
      }

      // Generate slug from title
      const baseSlug = slugify(title, { lower: true, strict: true });

      // Check for slug uniqueness within project
      let slug = baseSlug;
      let counter = 1;
      while (
        await prisma.wikiPage.findUnique({
          where: {
            projectId_slug: {
              projectId,
              slug,
            },
          },
        })
      ) {
        slug = `${baseSlug}-${counter}`;
        counter++;
      }

      const page = await prisma.wikiPage.create({
        data: {
          title,
          slug,
          content,
          projectId,
          parentId: parentId || null,
          authorId: req.user!.userId,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      // Create initial version
      await prisma.wikiVersion.create({
        data: {
          pageId: page.id,
          content,
          authorId: req.user!.userId,
        },
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          workspaceId: (await prisma.project.findUnique({ where: { id: projectId } }))?.workspaceId || "",
          projectId,
          userId: req.user!.userId,
          action: "created",
          entityType: "wiki_page",
          entityId: page.id,
          entityName: title,
        },
      });

      res.status(201).json(page);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to create page" });
    }
  }
);

/**
 * PUT /api/wiki/:pageId
 * Update page (creates new version automatically)
 */
router.put(
  "/:pageId",
  auth,
  [body("title").optional().isString(), body("content").optional().isString()],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const { title, content } = req.body;

      const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });

      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      // Check access
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: page.projectId,
            userId: req.user!.userId,
          },
        },
      });

      if (!projectMember || projectMember.role === "VIEWER") {
        return res.status(403).json({ error: "Access denied" });
      }

      // Update page
      const updatedPage = await prisma.wikiPage.update({
        where: { id: pageId },
        data: {
          title: title || page.title,
          content: content !== undefined ? content : page.content,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      // Create new version if content changed
      if (content !== undefined && content !== page.content) {
        await prisma.wikiVersion.create({
          data: {
            pageId,
            content,
            authorId: req.user!.userId,
          },
        });
      }

      // Log activity
      await prisma.activityLog.create({
        data: {
          workspaceId: (await prisma.project.findUnique({ where: { id: page.projectId } }))?.workspaceId || "",
          projectId: page.projectId,
          userId: req.user!.userId,
          action: "updated",
          entityType: "wiki_page",
          entityId: pageId,
          entityName: updatedPage.title,
        },
      });

      res.json(updatedPage);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to update page" });
    }
  }
);

/**
 * DELETE /api/wiki/:pageId
 * Delete page + all versions
 */
router.delete("/:pageId", auth, async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;

    const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check access - only ADMIN or OWNER can delete
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: page.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember || (projectMember.role !== "ADMIN" && projectMember.role !== "OWNER")) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Delete page (cascade deletes versions)
    await prisma.wikiPage.delete({ where: { id: pageId } });

    // Log activity
    await prisma.activityLog.create({
      data: {
        workspaceId: (await prisma.project.findUnique({ where: { id: page.projectId } }))?.workspaceId || "",
        projectId: page.projectId,
        userId: req.user!.userId,
        action: "deleted",
        entityType: "wiki_page",
        entityId: pageId,
        entityName: page.title,
      },
    });

    res.json({ message: "Page deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete page" });
  }
});

/**
 * GET /api/wiki/:pageId/versions
 * Get all versions for page
 */
router.get("/:pageId/versions", auth, async (req: Request, res: Response) => {
  try {
    const { pageId } = req.params;

    const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check access
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: page.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    const versions = await prisma.wikiVersion.findMany({
      where: { pageId },
      select: {
        id: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(versions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch versions" });
  }
});

/**
 * GET /api/wiki/:pageId/versions/:versionId
 * Get specific version
 */
router.get("/:pageId/versions/:versionId", auth, async (req: Request, res: Response) => {
  try {
    const { pageId, versionId } = req.params;

    const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });

    if (!page) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Check access
    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: page.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember) {
      return res.status(403).json({ error: "Access denied" });
    }

    const version = await prisma.wikiVersion.findUnique({
      where: { id: versionId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    if (!version || version.pageId !== pageId) {
      return res.status(404).json({ error: "Version not found" });
    }

    res.json(version);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch version" });
  }
});

/**
 * POST /api/wiki/:pageId/restore
 * Restore to specific version
 */
router.post(
  "/:pageId/restore",
  auth,
  [body("versionId").isString()],
  validateRequest,
  async (req: Request, res: Response) => {
    try {
      const { pageId } = req.params;
      const { versionId } = req.body;

      const page = await prisma.wikiPage.findUnique({ where: { id: pageId } });

      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      // Check access
      const projectMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: page.projectId,
            userId: req.user!.userId,
          },
        },
      });

      if (!projectMember || projectMember.role === "VIEWER") {
        return res.status(403).json({ error: "Access denied" });
      }

      const version = await prisma.wikiVersion.findUnique({
        where: { id: versionId },
      });

      if (!version || version.pageId !== pageId) {
        return res.status(404).json({ error: "Version not found" });
      }

      // Update page content to restored version
      const updatedPage = await prisma.wikiPage.update({
        where: { id: pageId },
        data: { content: version.content },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      // Create new version as restored version
      await prisma.wikiVersion.create({
        data: {
          pageId,
          content: version.content,
          authorId: req.user!.userId,
        },
      });

      // Log activity
      await prisma.activityLog.create({
        data: {
          workspaceId: (await prisma.project.findUnique({ where: { id: page.projectId } }))?.workspaceId || "",
          projectId: page.projectId,
          userId: req.user!.userId,
          action: "updated",
          entityType: "wiki_page",
          entityId: pageId,
          entityName: page.title,
          metadata: { action: "restored", versionId },
        },
      });

      res.json(updatedPage);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to restore version" });
    }
  }
);

export default router;
