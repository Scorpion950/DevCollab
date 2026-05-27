import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../lib/prisma";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
// Use gemini-2.0-flash (Requires billing/quota enabled on Google Cloud)
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

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

    if (usage >= limit) {
      throw new Error("Free tier AI limit reached. Please upgrade to Pro.");
    }
    return true;
  }

  static async logUsage(workspaceId: string, credits: number = 1) {
    await prisma.aICreditUsage.upsert({
      where: { workspaceId },
      create: { workspaceId, creditsUsed: credits },
      update: { creditsUsed: { increment: credits } },
    });
  }

  static async summarizeProject(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const tasks = await prisma.task.findMany({
      where: { projectId },
      select: { title: true, status: true, priority: true, assigneeId: true },
    });

    const prompt = `You are a project management AI assistant. Summarize the following project tasks into a concise, friendly markdown report showing progress.

Tasks:
${JSON.stringify(tasks, null, 2)}

Provide:
1. A brief overall status (1-2 sentences)
2. Progress by status (counts)
3. Any notable patterns or highlights
Keep it concise and actionable.`;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId);

    return { summary: result.response.text() };
  }

  static async whatsBlockingUs(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const tasks = await prisma.task.findMany({
      where: { projectId, status: "IN_PROGRESS" },
      select: { title: true, priority: true, updatedAt: true, dueDate: true },
    });

    const prompt = `You are a project management AI. Analyze these IN_PROGRESS tasks and identify potential blockers or risks.

Tasks in progress:
${JSON.stringify(tasks, null, 2)}

For each potential blocker, mention:
- What might be stuck and why
- Recommended action
- Risk level (Low/Medium/High)

If no tasks are in progress, say so and encourage the team.`;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId);

    return { analysis: result.response.text(), taskCount: tasks.length };
  }

  static async standupReport(projectId: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const [doneTasks, inProgressTasks, todoTasks] = await Promise.all([
      prisma.task.findMany({ where: { projectId, status: "DONE" }, select: { title: true, updatedAt: true }, take: 10, orderBy: { updatedAt: "desc" } }),
      prisma.task.findMany({ where: { projectId, status: "IN_PROGRESS" }, select: { title: true, assigneeId: true }, take: 10 }),
      prisma.task.findMany({ where: { projectId, status: "TODO", priority: { in: ["P0", "P1"] } }, select: { title: true, priority: true }, take: 5 }),
    ]);

    const prompt = `Generate a concise daily standup report for a developer team based on this project data.

✅ Recently done: ${JSON.stringify(doneTasks.map(t => t.title))}
🔄 In progress: ${JSON.stringify(inProgressTasks.map(t => t.title))}
🔜 High priority TODO: ${JSON.stringify(todoTasks.map(t => ({ title: t.title, priority: t.priority })))}

Format as:
**Yesterday:** ...
**Today:** ...
**Blockers:** ...

Be concise and professional.`;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId);

    return { report: result.response.text() };
  }

  static async taskBreakdown(description: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const prompt = `Break down this feature into 4-8 small, actionable development subtasks.

Feature: ${description}

Return ONLY a valid JSON array. No markdown, no explanation, just the JSON:
[{"title": "task title", "description": "brief description of what to do", "priority": "P0|P1|P2"}]`;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId);

    try {
      let text = result.response.text().trim();
      // Strip markdown code fences if present
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      return { tasks: JSON.parse(text) };
    } catch {
      return { tasks: [], error: "Could not parse AI response" };
    }
  }

  static async codeReview(code: string, language: string, workspaceId: string) {
    await this.checkCredits(workspaceId);

    const prompt = `You are an expert ${language} code reviewer. Review this code thoroughly.

\`\`\`${language}
${code}
\`\`\`

Return ONLY valid JSON (no markdown, no explanation):
{
  "score": <integer 1-100>,
  "summary": "<one sentence overall verdict>",
  "issues": ["<specific issue 1>", "<specific issue 2>"],
  "suggestions": ["<actionable suggestion 1>", "<actionable suggestion 2>"],
  "positives": ["<what the code does well>"]
}`;

    const result = await model.generateContent(prompt);
    await this.logUsage(workspaceId);

    try {
      let text = result.response.text().trim();
      text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      return { review: JSON.parse(text) };
    } catch {
      return {
        review: {
          score: 0,
          summary: "Failed to parse AI response",
          issues: ["Could not analyze code"],
          suggestions: [],
          positives: [],
        },
      };
    }
  }
}