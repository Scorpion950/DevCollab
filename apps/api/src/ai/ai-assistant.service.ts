import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { AnalyticsCacheService } from "../analytics/analytics-cache.service";
import type {
  AiAssistantAttachedContextDto,
  AiAssistantCitationDto,
  AiAssistantProposalDto,
  AiAssistantStatusDto,
  AiAssistantStreamEventDto,
  AiConversationDetailDto,
  AiConversationSummaryDto,
  AiInlineActionKind,
  AiMessageDto,
  TaskUserRef,
} from "@devcollab/shared";
import {
  buildAssistantPrompts,
  computeUsageCostFromPricing,
  extractAssistantCitations,
  extractAssistantPatchProposal,
  isSensitiveOrBlockedPath,
  normalizeRepoRelativePath,
  scrubSecrets,
  truncateContextFileContent,
} from "@devcollab/ai-core";
import type { ProjectContext } from "../authorization/authorization.constants";
import { DatabaseService } from "../database/database.service";
import { WorkerClientService } from "../workspaces/worker-client.service";
import { AiConfigService } from "./ai-config.service";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;
const MAX_PROMPT_CHARS = 8_000;
const MAX_SELECTION_CHARS = 12_000;
const MAX_EXTRA_FILES = 5;
const MAX_TOTAL_CONTEXT_BYTES = 38_000;

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function normalizeActionKind(raw: unknown): AiInlineActionKind {
  if (
    raw === "EXPLAIN" ||
    raw === "IMPROVE" ||
    raw === "FIND_BUGS" ||
    raw === "GENERATE_TESTS"
  ) {
    return raw;
  }
  return "CHAT";
}

function stripDisallowedControlChars(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if ((code >= 32 && code !== 127) || code === 9 || code === 10 || code === 13) {
      out += text[i];
    }
  }
  return out;
}

function sanitizePromptText(raw: unknown, maxLen: number, label: string): string {
  if (typeof raw !== "string") {
    throw new BadRequestException(`${label} must be text.`);
  }
  const cleaned = stripDisallowedControlChars(raw).trim();
  if (!cleaned) {
    throw new BadRequestException(`${label} cannot be empty.`);
  }
  if (cleaned.length > maxLen) {
    throw new BadRequestException(`${label} exceeds ${maxLen} characters.`);
  }
  return cleaned;
}

@Injectable()
export class AiAssistantService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aiConfig: AiConfigService,
    private readonly worker: WorkerClientService,
    @Optional() private readonly analyticsCache?: AnalyticsCacheService,
  ) {}

  private toMessageDto(row: {
    id: string;
    conversationId: string;
    author: TaskUserRef | null;
    role: "USER" | "ASSISTANT" | "SYSTEM";
    actionKind: AiInlineActionKind;
    status: "STREAMING" | "COMPLETED" | "CANCELLED" | "FAILED";
    content: string;
    errorMessage: string | null;
    attachedContext: unknown;
    citations: unknown;
    proposalJson: unknown;
    provider: string | null;
    model: string | null;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    createdAt: Date;
    updatedAt: Date;
  }): AiMessageDto {
    return {
      id: row.id,
      conversationId: row.conversationId,
      author: row.author,
      role: row.role,
      actionKind: row.actionKind,
      status: row.status,
      content: row.content,
      errorMessage: row.errorMessage,
      attachedContext: (row.attachedContext as AiAssistantAttachedContextDto | null) ?? null,
      citations: Array.isArray(row.citations) ? (row.citations as AiAssistantCitationDto[]) : [],
      proposal: (row.proposalJson as AiAssistantProposalDto | null) ?? null,
      provider: row.provider,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      latencyMs: row.latencyMs,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getStatus(
    orgId: string,
    projectId: string,
    actorUserId: string,
    projectContext: ProjectContext,
  ): Promise<AiAssistantStatusDto> {
    const cfg = this.aiConfig.getConfiguration();
    const configured = this.aiConfig.isConfigured();
    const canRunAi = projectContext.canRunAi && projectContext.project.status === "ACTIVE";

    const usageAgg = await this.db.prisma.aiAssistantUsageRecord.aggregate({
      where: { organizationId: orgId, projectId, userId: actorUserId },
      _sum: { inputTokens: true, outputTokens: true, estimatedCostUsd: true },
    });

    const usageDelegate = this.db.prisma.aiAssistantUsageRecord as unknown as {
      findMany?: (args: unknown) => Promise<
        Array<{
          usageAvailable: boolean;
          costAvailable: boolean;
          currency: string;
        }>
      >;
    };
    let usageAvailable = true;
    let costAvailable = usageAgg._sum.estimatedCostUsd !== null;
    let currency = "USD";
    if (typeof usageDelegate.findMany === "function") {
      const sampleFlags = await usageDelegate.findMany({
        where: { organizationId: orgId, projectId, userId: actorUserId },
        select: { usageAvailable: true, costAvailable: true, currency: true },
        take: 250,
      });
      if (sampleFlags.length > 0) {
        usageAvailable = sampleFlags.some((r) => r.usageAvailable);
        costAvailable = sampleFlags.some((r) => r.costAvailable);
        const currencies = Array.from(new Set(sampleFlags.filter((r) => r.costAvailable).map((r) => r.currency)));
        if (currencies.length === 1) currency = currencies[0]!;
      }
    }

    const reason = !configured
      ? "AI provider is not configured on this server (set AI_PROVIDER, AI_MODEL, and AI_API_KEY)."
      : !projectContext.canRunAi
        ? "Your current project role does not have permission to invoke AI coding assistance."
        : projectContext.project.status !== "ACTIVE"
          ? "AI coding assistance is disabled for archived projects."
          : `Ready (${cfg.provider} · ${cfg.model})`;

    return {
      configured,
      provider: configured ? (cfg.provider ?? null) : null,
      model: configured ? (cfg.model ?? null) : null,
      canRunAi,
      reason,
      usageAvailable,
      totalInputTokens: usageAgg._sum.inputTokens ?? 0,
      totalOutputTokens: usageAgg._sum.outputTokens ?? 0,
      costAvailable,
      currency,
      estimatedCostUsd: Number(usageAgg._sum.estimatedCostUsd ?? 0).toFixed(6),
    };
  }

  async listConversations(
    actorUserId: string,
    orgId: string,
    projectId: string,
  ): Promise<AiConversationSummaryDto[]> {
    const rows = await this.db.prisma.aiConversation.findMany({
      where: {
        organizationId: orgId,
        projectId,
        userId: actorUserId,
        archivedAt: null,
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 30,
      include: { _count: { select: { messages: true } } },
    });

    return rows.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      projectId: c.projectId,
      userId: c.userId,
      workspaceId: c.workspaceId,
      taskId: c.taskId,
      collabSessionId: c.collabSessionId,
      title: c.title,
      isSharedWithSession: c.isSharedWithSession,
      lastActiveFile: c.lastActiveFile,
      messageCount: c._count.messages,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));
  }

  async createConversation(
    actorUserId: string,
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
    body: {
      title?: unknown;
      workspaceId?: unknown;
      taskId?: unknown;
      collabSessionId?: unknown;
      lastActiveFile?: unknown;
    },
  ): Promise<AiConversationDetailDto> {
    if (!projectContext.canRunAi && !projectContext.canManage) {
      throw new ForbiddenException("Your role does not permit AI assistant sessions in this project.");
    }

    const workspaceId =
      typeof body.workspaceId === "string" && body.workspaceId.trim()
        ? body.workspaceId.trim()
        : null;
    if (workspaceId) {
      await this.assertWorkspaceAccess(actorUserId, orgId, projectId, workspaceId, projectContext);
    }

    const taskId = typeof body.taskId === "string" && body.taskId.trim() ? body.taskId.trim() : null;
    if (taskId) {
      const task = await this.db.prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId, projectId, archivedAt: null },
        select: { id: true },
      });
      if (!task) throw new NotFoundException("Linked task not found in this project.");
    }

    const collabSessionId =
      typeof body.collabSessionId === "string" && body.collabSessionId.trim()
        ? body.collabSessionId.trim()
        : null;
    if (collabSessionId) {
      const participant = await this.db.prisma.collabParticipant.findFirst({
        where: {
          sessionId: collabSessionId,
          userId: actorUserId,
          status: "ACTIVE",
          session: { organizationId: orgId, projectId },
        },
      });
      if (!participant) {
        throw new ForbiddenException("Not an active participant in the specified collaborative session.");
      }
    }

    const lastActiveFile =
      typeof body.lastActiveFile === "string"
        ? normalizeRepoRelativePath(body.lastActiveFile)
        : null;
    const rawTitle = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
    const title = rawTitle || (lastActiveFile ? `Assistant · ${lastActiveFile}` : "IDE AI Assistant");

    const conv = await this.db.prisma.aiConversation.create({
      data: {
        organizationId: orgId,
        projectId,
        userId: actorUserId,
        workspaceId,
        taskId,
        collabSessionId,
        title,
        lastActiveFile,
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }],
          include: { author: { select: USER_SELECT } },
        },
      },
    });

    return {
      id: conv.id,
      organizationId: conv.organizationId,
      projectId: conv.projectId,
      userId: conv.userId,
      workspaceId: conv.workspaceId,
      taskId: conv.taskId,
      collabSessionId: conv.collabSessionId,
      title: conv.title,
      isSharedWithSession: conv.isSharedWithSession,
      lastActiveFile: conv.lastActiveFile,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => this.toMessageDto(m)),
    };
  }

  private async loadOwnedConversation(
    actorUserId: string,
    orgId: string,
    projectId: string,
    conversationId: string,
  ) {
    const conv = await this.db.prisma.aiConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: orgId,
        projectId,
        archivedAt: null,
      },
      include: {
        messages: {
          orderBy: [{ createdAt: "asc" }],
          take: 80,
          include: { author: { select: USER_SELECT } },
        },
      },
    });

    if (!conv) {
      throw new NotFoundException("AI assistant conversation not found.");
    }
    if (conv.userId !== actorUserId) {
      throw new ForbiddenException("AI assistant conversations are private to their creator.");
    }
    return conv;
  }

  async getConversationDetail(
    actorUserId: string,
    orgId: string,
    projectId: string,
    conversationId: string,
  ): Promise<AiConversationDetailDto> {
    const conv = await this.loadOwnedConversation(actorUserId, orgId, projectId, conversationId);
    return {
      id: conv.id,
      organizationId: conv.organizationId,
      projectId: conv.projectId,
      userId: conv.userId,
      workspaceId: conv.workspaceId,
      taskId: conv.taskId,
      collabSessionId: conv.collabSessionId,
      title: conv.title,
      isSharedWithSession: conv.isSharedWithSession,
      lastActiveFile: conv.lastActiveFile,
      messageCount: conv.messages.length,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages: conv.messages.map((m) => this.toMessageDto(m)),
    };
  }

  async deleteConversation(
    actorUserId: string,
    orgId: string,
    projectId: string,
    conversationId: string,
  ): Promise<{ deleted: true }> {
    const conv = await this.loadOwnedConversation(actorUserId, orgId, projectId, conversationId);
    await this.db.prisma.aiConversation.update({
      where: { id: conv.id },
      data: { archivedAt: new Date() },
    });
    return { deleted: true };
  }

  private async assertWorkspaceAccess(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ) {
    const ws = await this.db.prisma.devWorkspace.findFirst({
      where: { id: workspaceId, organizationId: orgId, projectId, deletedAt: null },
      select: {
        id: true,
        ownerId: true,
        workspacePathKey: true,
        repoFullName: true,
        currentBranch: true,
        baseBranch: true,
        status: true,
      },
    });
    if (!ws) throw new NotFoundException("Workspace not found.");
    if (ws.ownerId === actorUserId || projectContext.canManage) {
      return { ws, collabRole: "OWNER" as const };
    }
    const collab = await this.db.prisma.collabParticipant.findFirst({
      where: {
        userId: actorUserId,
        status: "ACTIVE",
        session: { workspaceId: ws.id, status: "ACTIVE", organizationId: orgId, projectId },
      },
      select: { role: true },
    });
    if (!collab) {
      throw new ForbiddenException("Workspace is private to its owner or active session participants.");
    }
    return { ws, collabRole: collab.role };
  }

  async streamMessage(input: {
    actorUserId: string;
    orgId: string;
    projectId: string;
    conversationId: string;
    projectContext: ProjectContext;
    body: {
      prompt?: unknown;
      actionKind?: unknown;
      workspaceId?: unknown;
      taskId?: unknown;
      pullRequestId?: unknown;
      activeFilePath?: unknown;
      selectedText?: unknown;
      selectionStartLine?: unknown;
      selectionEndLine?: unknown;
      attachedPaths?: unknown;
      includeLocalDiff?: unknown;
    };
    signal: AbortSignal;
    emit: (event: AiAssistantStreamEventDto) => void;
  }): Promise<void> {
    if (!input.projectContext.canRunAi || input.projectContext.project.status !== "ACTIVE") {
      throw new ForbiddenException("AI assistant usage requires active project AI permissions.");
    }

    const conv = await this.loadOwnedConversation(
      input.actorUserId,
      input.orgId,
      input.projectId,
      input.conversationId,
    );

    const providerClient = this.aiConfig.createProviderClient();
    const aiCfg = this.aiConfig.getConfiguration();
    const actionKind = normalizeActionKind(input.body.actionKind);
    const defaultPromptForAction: Record<AiInlineActionKind, string> = {
      CHAT: "",
      EXPLAIN: "Explain the selected code clearly, citing file paths and line numbers.",
      IMPROVE: "Suggest improvements and provide a minimal unified diff patch if helpful.",
      FIND_BUGS: "Audit the selected code for bugs, security issues, and edge cases.",
      GENERATE_TESTS: "Generate unit tests covering normal and edge cases for this selection.",
    };

    const userPrompt = sanitizePromptText(
      typeof input.body.prompt === "string" && input.body.prompt.trim()
        ? input.body.prompt
        : defaultPromptForAction[actionKind],
      MAX_PROMPT_CHARS,
      "Prompt",
    );

    const effectiveWorkspaceId =
      typeof input.body.workspaceId === "string" && input.body.workspaceId.trim()
        ? input.body.workspaceId.trim()
        : conv.workspaceId;
    const effectiveTaskId =
      typeof input.body.taskId === "string" && input.body.taskId.trim()
        ? input.body.taskId.trim()
        : conv.taskId;
    const prId =
      typeof input.body.pullRequestId === "string" && input.body.pullRequestId.trim()
        ? input.body.pullRequestId.trim()
        : null;

    const wsAccess = effectiveWorkspaceId
      ? await this.assertWorkspaceAccess(
          input.actorUserId,
          input.orgId,
          input.projectId,
          effectiveWorkspaceId,
          input.projectContext,
        )
      : null;

    const [taskRow, prRow] = await Promise.all([
      effectiveTaskId
        ? this.db.prisma.task.findFirst({
            where: {
              id: effectiveTaskId,
              organizationId: input.orgId,
              projectId: input.projectId,
              archivedAt: null,
            },
            select: { id: true, identifier: true, title: true, description: true, status: true },
          })
        : Promise.resolve(null),
      prId
        ? this.db.prisma.pullRequest.findFirst({
            where: { id: prId, organizationId: input.orgId, projectId: input.projectId },
            select: { id: true, number: true, title: true, baseRef: true, headRef: true },
          })
        : Promise.resolve(null),
    ]);

    const activeFilePath =
      typeof input.body.activeFilePath === "string"
        ? normalizeRepoRelativePath(input.body.activeFilePath)
        : null;

    let totalBytes = 0;
    let excludedSensitiveCount = 0;
    let truncatedReason: string | null = null;
    const includedFiles: AiAssistantAttachedContextDto["includedFiles"] = [];
    const promptFiles: Array<{ path: string; content: string }> = [];
    const fileHashesByPath: Record<string, string> = {};
    let activeFileObj: { path: string; content: string } | null = null;

    const tryAttachFile = async (relPath: string, isPrimaryActive = false) => {
      if (!wsAccess) return;
      if (isSensitiveOrBlockedPath(relPath, true)) {
        excludedSensitiveCount += 1;
        return;
      }
      if (totalBytes >= MAX_TOTAL_CONTEXT_BYTES) {
        truncatedReason = "Reached maximum repository context budget (38 KB).";
        return;
      }
      if (!isPrimaryActive && includedFiles.some((f) => f.path === relPath)) return;

      try {
        const file = await this.worker.readFile(wsAccess.ws.workspacePathKey, relPath);
        if (file.isBinary) {
          excludedSensitiveCount += 1;
          return;
        }
        const scrubbed = scrubSecrets(file.content);
        const remainingBudget = Math.max(1024, MAX_TOTAL_CONTEXT_BYTES - totalBytes);
        const cap = Math.min(isPrimaryActive ? 16_000 : 8_000, remainingBudget);
        const bounded = truncateContextFileContent(scrubbed, cap);
        totalBytes += Buffer.byteLength(bounded.text, "utf8");
        fileHashesByPath[relPath] = file.versionHash;
        includedFiles.push({
          path: relPath,
          bytes: Buffer.byteLength(bounded.text, "utf8"),
          sha256: file.versionHash,
          truncated: bounded.truncated,
        });
        if (isPrimaryActive) {
          activeFileObj = { path: relPath, content: bounded.text };
        } else {
          promptFiles.push({ path: relPath, content: bounded.text });
        }
      } catch {
        // Ignore unreadable or non-existent file cleanly
      }
    };

    if (activeFilePath) {
      await tryAttachFile(activeFilePath, true);
    }

    const extraPaths = Array.isArray(input.body.attachedPaths)
      ? Array.from(
          new Set(
            input.body.attachedPaths
              .filter((p): p is string => typeof p === "string")
              .map((p) => normalizeRepoRelativePath(p))
              .filter((p): p is string => Boolean(p)),
          ),
        ).slice(0, MAX_EXTRA_FILES)
      : [];

    for (const relPath of extraPaths) {
      if (relPath !== activeFilePath) {
        await tryAttachFile(relPath, false);
      }
    }

    let localDiffText: string | null = null;
    if (wsAccess && input.body.includeLocalDiff === true) {
      try {
        const diff = await this.worker.getGitDiff(wsAccess.ws.workspacePathKey, "unstaged");
        if (diff.rawDiff.trim()) {
          localDiffText = scrubSecrets(diff.rawDiff.slice(0, 12_000));
        }
      } catch {
        localDiffText = null;
      }
    }

    const selectionText =
      typeof input.body.selectedText === "string" && input.body.selectedText.trim()
        ? scrubSecrets(input.body.selectedText.slice(0, MAX_SELECTION_CHARS))
        : null;
    const selStart =
      typeof input.body.selectionStartLine === "number" && input.body.selectionStartLine > 0
        ? Math.floor(input.body.selectionStartLine)
        : 1;
    const selEnd =
      typeof input.body.selectionEndLine === "number" && input.body.selectionEndLine >= selStart
        ? Math.floor(input.body.selectionEndLine)
        : selStart;

    const selectionSummary =
      selectionText && activeFilePath
        ? { startLine: selStart, endLine: selEnd, charCount: selectionText.length }
        : null;

    const estimatedInputTokens = Math.max(
      1,
      Math.ceil((userPrompt.length + totalBytes + (localDiffText?.length ?? 0)) / 4),
    );

    const attachedContext: AiAssistantAttachedContextDto = {
      projectId: input.projectId,
      projectName: input.projectContext.project.name,
      taskId: taskRow?.id ?? null,
      taskIdentifier: taskRow?.identifier ?? null,
      taskTitle: taskRow?.title ?? null,
      prId: prRow?.id ?? null,
      prNumber: prRow?.number ?? null,
      prTitle: prRow?.title ?? null,
      activeFilePath,
      selection: selectionSummary,
      includedFiles,
      includedLocalDiff: Boolean(localDiffText),
      excludedSensitiveCount,
      totalContextBytes: totalBytes,
      estimatedInputTokens,
      truncatedReason,
    };

    const userMsg = await this.db.prisma.aiMessage.create({
      data: {
        conversationId: conv.id,
        authorId: input.actorUserId,
        role: "USER",
        actionKind,
        status: "COMPLETED",
        content: userPrompt,
        attachedContext: attachedContext as unknown as object,
      },
      include: { author: { select: USER_SELECT } },
    });

    const assistantMsg = await this.db.prisma.aiMessage.create({
      data: {
        conversationId: conv.id,
        authorId: null,
        role: "ASSISTANT",
        actionKind,
        status: "STREAMING",
        content: "",
        attachedContext: attachedContext as unknown as object,
        provider: aiCfg.provider,
        model: aiCfg.model,
      },
      include: { author: { select: USER_SELECT } },
    });

    await this.db.prisma.aiConversation.update({
      where: { id: conv.id },
      data: {
        lastActiveFile: activeFilePath ?? conv.lastActiveFile,
        updatedAt: new Date(),
      },
    });

    input.emit({
      type: "meta",
      conversationId: conv.id,
      userMessageId: userMsg.id,
      assistantMessageId: assistantMsg.id,
      provider: aiCfg.provider ?? "unknown",
      model: aiCfg.model ?? "unknown",
    });
    input.emit({ type: "context", attachedContext });

    const { systemPrompt, messages } = buildAssistantPrompts({
      actionKind,
      userPrompt,
      projectName: input.projectContext.project.name,
      repoFullName: wsAccess?.ws.repoFullName ?? null,
      branchName: wsAccess?.ws.currentBranch ?? wsAccess?.ws.baseBranch ?? null,
      task: taskRow,
      pullRequest: prRow
        ? {
            number: prRow.number,
            title: prRow.title,
            baseBranch: prRow.baseRef,
            headBranch: prRow.headRef,
          }
        : null,
      activeFile: activeFileObj,
      selection:
        selectionText && activeFilePath
          ? {
              path: activeFilePath,
              startLine: selStart,
              endLine: selEnd,
              text: selectionText,
            }
          : null,
      contextFiles: promptFiles,
      localDiffText,
      recentHistory: conv.messages
        .filter((m) => (m.role === "USER" || m.role === "ASSISTANT") && m.status === "COMPLETED")
        .slice(-8)
        .map((m) => ({
          role: m.role === "ASSISTANT" ? "ASSISTANT" : "USER",
          content: m.content,
        })),
    });

    let streamedText = "";
    try {
      const result = await providerClient.streamAssistantChat({
        systemPrompt,
        messages,
        signal: input.signal,
        onDelta: (delta) => {
          streamedText += delta;
          input.emit({ type: "delta", text: delta });
        },
      });

      const allowedPaths = [
        ...(activeFilePath ? [activeFilePath] : []),
        ...includedFiles.map((f) => f.path),
      ];
      const citations = extractAssistantCitations(result.content, allowedPaths);
      const rawProposal = extractAssistantPatchProposal(result.content);

      let fullProposal: AiAssistantProposalDto | null = null;
      if (rawProposal) {
        const baseFileHashes: Record<string, string | null> = {};
        for (const f of rawProposal.targetFiles) {
          if (f.path in fileHashesByPath) {
            baseFileHashes[f.path] = fileHashesByPath[f.path] ?? null;
          } else if (wsAccess) {
            try {
              const live = await this.worker.readFile(wsAccess.ws.workspacePathKey, f.path);
              baseFileHashes[f.path] = live.versionHash;
            } catch {
              baseFileHashes[f.path] = f.operation === "create" ? null : sha256Text("");
            }
          }
        }
        fullProposal = {
          id: `prop_${randomUUID()}`,
          summary: rawProposal.summary,
          unifiedDiff: rawProposal.unifiedDiff,
          targetFiles: rawProposal.targetFiles,
          baseFileHashes,
          appliedAt: null,
          appliedById: null,
          conflictReason: null,
        };
      }

      const savedAssistant = await this.db.prisma.$transaction(async (tx) => {
        const usageReported = Boolean(
          result.usage.usageReported &&
            result.usage.inputTokens !== null &&
            result.usage.outputTokens !== null,
        );
        const now = new Date();
        const pricingDelegate = (tx as unknown as {
          aiModelPricing?: {
            findFirst?: (args: unknown) => Promise<{
              id: string;
              currency: string;
              inputRatePer1m: { toString(): string } | string | number;
              outputRatePer1m: { toString(): string } | string | number;
              cachedInputRatePer1m: { toString(): string } | string | number | null;
            } | null>;
          };
        }).aiModelPricing;

        const pricingRule =
          pricingDelegate && typeof pricingDelegate.findFirst === "function"
            ? await pricingDelegate.findFirst({
                where: {
                  organizationId: input.orgId,
                  provider: result.usage.provider,
                  model: result.usage.model,
                  isActive: true,
                  effectiveFrom: { lte: now },
                  OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
                },
                orderBy: [{ version: "desc" }],
                select: {
                  id: true,
                  currency: true,
                  inputRatePer1m: true,
                  outputRatePer1m: true,
                  cachedInputRatePer1m: true,
                },
              })
            : null;

        const cost = computeUsageCostFromPricing({
          usageReported,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          cachedTokens: result.usage.cachedTokens ?? null,
          pricingRule,
          fallbackCostAvailable: result.usage.costAvailable,
          fallbackEstimatedCostUsd: result.usage.estimatedCostUsd,
        });

        const updated = await tx.aiMessage.update({
          where: { id: assistantMsg.id },
          data: {
            status: "COMPLETED",
            content: result.content,
            citations: citations as unknown as object,
            proposalJson: (fullProposal as unknown as object) ?? undefined,
            provider: result.usage.provider,
            model: result.usage.model,
            inputTokens: usageReported ? (result.usage.inputTokens ?? 0) : 0,
            outputTokens: usageReported ? (result.usage.outputTokens ?? 0) : 0,
            latencyMs: result.usage.latencyMs,
          },
          include: { author: { select: USER_SELECT } },
        });

        const usagePayload = {
          conversationId: conv.id,
          messageId: updated.id,
          organizationId: input.orgId,
          projectId: input.projectId,
          userId: input.actorUserId,
          actionKind,
          provider: result.usage.provider,
          model: result.usage.model,
          usageAvailable: usageReported,
          inputTokens: usageReported ? result.usage.inputTokens : null,
          outputTokens: usageReported ? result.usage.outputTokens : null,
          totalTokens: usageReported ? result.usage.totalTokens : null,
          cachedTokens: result.usage.cachedTokens ?? null,
          reasoningTokens: result.usage.reasoningTokens ?? null,
          pricingId: cost.pricingId,
          currency: cost.currency,
          costAvailable: cost.costAvailable,
          estimatedCostUsd: cost.estimatedCostUsd,
          latencyMs: result.usage.latencyMs,
        };

        const usageTxDelegate = tx.aiAssistantUsageRecord as unknown as {
          upsert?: (args: unknown) => Promise<unknown>;
          create: (args: { data: typeof usagePayload }) => Promise<unknown>;
        };
        if (typeof usageTxDelegate.upsert === "function") {
          await usageTxDelegate.upsert({
            where: { messageId: updated.id },
            create: usagePayload,
            update: {},
          });
        } else {
          await usageTxDelegate.create({ data: usagePayload });
        }

        return updated;
      });

      this.analyticsCache?.invalidateProject(input.orgId, input.projectId);
      input.emit({
        type: "done",
        message: this.toMessageDto(savedAssistant),
      });
    } catch (error) {
      const errCode = (error as { code?: string })?.code;
      const isCancelled = input.signal.aborted || errCode === "AI_STREAM_CANCELLED";
      const safeMessage = scrubSecrets(
        error instanceof Error ? error.message : String(error),
        [aiCfg.apiKey],
      );

      await this.db.prisma.aiMessage
        .update({
          where: { id: assistantMsg.id },
          data: {
            status: isCancelled ? "CANCELLED" : "FAILED",
            content: streamedText,
            errorMessage: isCancelled ? "Cancelled by user." : safeMessage.slice(0, 600),
          },
        })
        .catch(() => undefined);

      input.emit({
        type: "error",
        message: isCancelled ? "Generation cancelled." : safeMessage,
        status: isCancelled ? "CANCELLED" : "FAILED",
      });
    }
  }

  async applyAssistantProposal(
    actorUserId: string,
    orgId: string,
    projectId: string,
    conversationId: string,
    messageId: string,
    projectContext: ProjectContext,
    workspaceIdOverride?: string,
  ): Promise<{ message: AiMessageDto; filesChanged: number }> {
    if (!projectContext.canRunAi || projectContext.project.status !== "ACTIVE") {
      throw new ForbiddenException("Active AI coding permission is required to apply proposals.");
    }

    const conv = await this.loadOwnedConversation(actorUserId, orgId, projectId, conversationId);
    const msg = conv.messages.find((m) => m.id === messageId);
    if (!msg) {
      throw new NotFoundException("Assistant message not found.");
    }

    const proposal = (msg.proposalJson as AiAssistantProposalDto | null) ?? null;
    if (!proposal || !proposal.unifiedDiff) {
      throw new BadRequestException("This assistant message does not contain an applicable patch proposal.");
    }
    if (proposal.appliedAt) {
      throw new ConflictException("This AI proposal has already been applied.");
    }

    const targetWorkspaceId = workspaceIdOverride?.trim() || conv.workspaceId;
    if (!targetWorkspaceId) {
      throw new BadRequestException("Select an active workspace before applying an AI code proposal.");
    }

    const wsAccess = await this.assertWorkspaceAccess(
      actorUserId,
      orgId,
      projectId,
      targetWorkspaceId,
      projectContext,
    );
    if (wsAccess.collabRole === "VIEWER") {
      throw new ForbiddenException("Read-only viewer role cannot apply AI code edits to the workspace.");
    }
    if (wsAccess.ws.status !== "READY" && wsAccess.ws.status !== "ACTIVE") {
      throw new ConflictException(`Workspace is ${wsAccess.ws.status}; resume it before applying edits.`);
    }

    let applyResult;
    try {
      applyResult = await this.worker.applyPatch(
        wsAccess.ws.workspacePathKey,
        proposal.unifiedDiff,
        {
          expectedBaseHashes: proposal.baseFileHashes,
          allowDirtyTargetFiles: true,
        },
      );
    } catch (error) {
      if (error instanceof ConflictException) {
        await this.db.prisma.aiMessage.update({
          where: { id: msg.id },
          data: {
            proposalJson: {
              ...proposal,
              conflictReason: error.message,
            } as unknown as object,
          },
        });
      }
      throw error;
    }

    const nextProposal: AiAssistantProposalDto = {
      ...proposal,
      appliedAt: new Date().toISOString(),
      appliedById: actorUserId,
      conflictReason: null,
    };

    const updatedMsg = await this.db.prisma.$transaction(async (tx) => {
      const updated = await tx.aiMessage.update({
        where: { id: msg.id },
        data: { proposalJson: nextProposal as unknown as object },
        include: { author: { select: USER_SELECT } },
      });

      await tx.workspaceEvent.create({
        data: {
          workspaceId: wsAccess.ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "AI_ASSISTANT_PATCH_APPLIED",
          message: `Applied AI assistant patch (${applyResult.filesChanged} file(s)): ${proposal.summary.slice(0, 140)}`,
          metadata: { conversationId, messageId, proposalId: proposal.id },
        },
      });

      if (conv.taskId) {
        await tx.taskActivity.create({
          data: {
            taskId: conv.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "AI_ASSISTANT_PATCH_APPLIED",
            summary: `Applied AI assistant patch (${applyResult.filesChanged} file(s)): ${proposal.summary.slice(0, 120)}`,
          },
        });
      }

      return updated;
    });

    return {
      message: this.toMessageDto(updatedMsg),
      filesChanged: applyResult.filesChanged,
    };
  }
}
