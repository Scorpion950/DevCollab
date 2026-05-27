import { Router } from "express";
import { authenticate } from "../middleware/auth";
import { AIService } from "../services/ai.service";

const router = Router();

router.use(authenticate);

router.post("/summarize-project", async (req, res) => {
  try {
    const { projectId, workspaceId } = req.body;
    const result = await AIService.summarizeProject(projectId, workspaceId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/whats-blocking-us", async (req, res) => {
  try {
    const { projectId, workspaceId } = req.body;
    const result = await AIService.whatsBlockingUs(projectId, workspaceId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/standup-report", async (req, res) => {
  try {
    const { projectId, workspaceId } = req.body;
    const result = await AIService.standupReport(projectId, workspaceId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/task-breakdown", async (req, res) => {
  try {
    const { description, workspaceId } = req.body;
    const result = await AIService.taskBreakdown(description, workspaceId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/code-review", async (req, res) => {
  try {
    const { code, language, workspaceId } = req.body;
    const result = await AIService.codeReview(code, language, workspaceId);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export const aiRouter: Router = router;