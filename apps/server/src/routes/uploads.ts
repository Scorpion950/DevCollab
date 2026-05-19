import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { auth } from "../middleware/auth";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import streamifier from "streamifier";

const router: Router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// =============================================
// UPLOAD ROUTES
// =============================================

/**
 * POST /api/uploads/task-attachment
 * Upload file for task (to Cloudinary)
 */
router.post("/task-attachment", auth, upload.single("file"), async (req: Request, res: Response) => {
  try {
    const { taskId } = req.body;

    if (!taskId || typeof taskId !== "string") {
      return res.status(400).json({ error: "taskId is required" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "File is required" });
    }

    // Get task and check access
    const task = await prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: task.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember || projectMember.role === "VIEWER") {
      return res.status(403).json({ error: "Access denied" });
    }

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `devcollab/tasks/${taskId}`,
        resource_type: "auto",
      },
      async (error, result) => {
        if (error) {
          console.error(error);
          return res.status(500).json({ error: "Failed to upload file" });
        }

        try {
          // Create attachment record
          const attachment = await prisma.taskAttachment.create({
            data: {
              taskId,
              url: result!.secure_url,
              filename: req.file!.originalname,
              fileSize: req.file!.size,
              mimeType: req.file!.mimetype,
              uploadedById: req.user!.userId,
            },
          });

          // Log activity
          const project = await prisma.project.findUnique({ where: { id: task.projectId } });
          await prisma.activityLog.create({
            data: {
              workspaceId: project?.workspaceId || "",
              projectId: task.projectId,
              userId: req.user!.userId,
              action: "updated",
              entityType: "task",
              entityId: taskId,
              entityName: task.title,
              metadata: { action: "attachment_added", attachmentId: attachment.id },
            },
          });

          res.status(201).json(attachment);
        } catch (dbError) {
          console.error(dbError);
          res.status(500).json({ error: "Failed to save attachment record" });
        }
      }
    );

    streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

/**
 * DELETE /api/uploads/:attachmentId
 * Delete attachment
 */
router.delete("/:attachmentId", auth, async (req: Request, res: Response) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await prisma.taskAttachment.findUnique({ where: { id: attachmentId } });

    if (!attachment) {
      return res.status(404).json({ error: "Attachment not found" });
    }

    // Get task and check access
    const task = await prisma.task.findUnique({ where: { id: attachment.taskId } });

    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    const projectMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: task.projectId,
          userId: req.user!.userId,
        },
      },
    });

    if (!projectMember || (projectMember.role === "VIEWER" && attachment.uploadedById !== req.user!.userId)) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Extract Cloudinary public_id from URL
    const urlParts = attachment.url.split("/");
    const publicId = urlParts.slice(-2).join("/").replace(/\.[^/.]+$/, "");

    // Delete from Cloudinary
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudError) {
      console.warn("Failed to delete from Cloudinary:", cloudError);
      // Continue anyway
    }

    // Delete attachment record
    await prisma.taskAttachment.delete({ where: { id: attachmentId } });

    // Log activity
    const project = await prisma.project.findUnique({ where: { id: task.projectId } });
    await prisma.activityLog.create({
      data: {
        workspaceId: project?.workspaceId || "",
        projectId: task.projectId,
        userId: req.user!.userId,
        action: "updated",
        entityType: "task",
        entityId: attachment.taskId,
        entityName: task.title,
        metadata: { action: "attachment_deleted", attachmentId },
      },
    });

    res.json({ message: "Attachment deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
