import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../lib/prisma";

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });

export class AIService {
  static async checkCredits(workspaceId: string) {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { aiCreditUsage: true },
    });

    if (!workspace) throw new Error("Workspace not found");
    if (workspace.plan === "PRO") return true;

    const limit = parseInt(process.env.AI_FREE_DAILY_LIMIT || "10", 10);
    const usage = workspace.aiCreditUsage?.creditsUsed || 0;
    
    // In a real app we'd reset the credits periodically, for now just check against limit
    if (usage >= limit) {
      throw new Error("Free tier AI limit reached. Please upgrade to Pro.");
    }
    return true;
  }

  static async logUsage(workspaceId: string, credits: number) {
    await prisma.aICreditUsage.upsert({
      where: { workspaceId },
      create: {
        workspaceId,
        creditsUsed: credits,
      },
      update: {
        creditsUsed: { increment: credits },
      },
    });
  }

  static async summarizeProject(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);
    
    // Fetch all tasks
    const tasks = await prisma.task.findMany({
      where: { projectId },
      include: { assignee: true },
    });

    const prompt = `
      Summarise the following task list into a brief markdown summary of the project status.
      Tasks:
      ${JSON.stringify(tasks.map(t => ({ title: t.title, status: t.status, priority: t.priority })), null, 2)}
    `;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId, 1);
    
    return { summary: result.response.text() };
  }

  static async whatsBlockingUs(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const tasks = await prisma.task.findMany({
      where: { 
        projectId,
        status: "IN_PROGRESS",
      },
    });

    // In a real implementation we would filter tasks in progress > 3 days. 
    // Here we'll just send all IN_PROGRESS tasks and ask Gemini to identify blockers.
    const prompt = `
      Look at these tasks currently 'IN_PROGRESS'. Provide a brief commentary on potential blockers or what might be stuck.
      Tasks:
      ${JSON.stringify(tasks.map(t => ({ title: t.title, priority: t.priority, updatedAt: t.updatedAt })), null, 2)}
    `;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId, 1);

    return { analysis: result.response.text(), tasks };
  }

  static async standupReport(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const prompt = `
      Generate a brief standup report (What's done, What's in progress, Blockers) based on a typical software project.
    `;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId, 1);

    return { report: result.response.text() };
  }

  static async taskBreakdown(description: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const prompt = `
      Break down the following feature into small, actionable subtasks. 
      Return ONLY a JSON array of objects with 'title' and 'description' keys. No markdown blocks.
      Feature: ${description}
    `;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId, 1);

    try {
      let text = result.response.text().trim();
      if (text.startsWith("\`\`\`json")) {
        text = text.substring(7, text.length - 3).trim();
      }
      return { tasks: JSON.parse(text) };
    } catch (e) {
      return { tasks: [] };
    }
  }

  static async codeReview(code: string, language: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const prompt = `
      Review the following ${language} code for bugs, performance, security, and readability.
      Return ONLY a JSON object with this exact structure:
      { "score": 1-100, "issues": ["issue 1", "issue 2"], "suggestions": ["suggestion 1"] }
      Code:
      ${code}
    `;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId, 1);

    try {
      let text = result.response.text().trim();
      if (text.startsWith("\`\`\`json")) {
        text = text.substring(7, text.length - 3).trim();
      }
      return { review: JSON.parse(text) };
    } catch (e) {
      return { review: { score: 0, issues: ["Failed to parse review"], suggestions: [] } };
    }
  }
}