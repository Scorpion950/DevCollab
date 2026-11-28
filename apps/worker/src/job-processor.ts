import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PrismaClient } from "@devcollab/database";
import {
  AiProviderClient,
  GitHubSourceClient,
  applyValidatedPatchToDirectory,
  extractSafeTarGz,
  frameUntrustedRepoFiles,
  isSensitiveOrBlockedPath,
  scrubSecrets,
  selectRepositoryContextCandidates,
  truncateContextFileContent,
  validateAndParseUnifiedDiff,
  type AiStageUsage,
} from "@devcollab/ai-core";
import type { AgentContextFileDto, AgentPlanStepDto } from "@devcollab/shared";
import type { WorkerConfig } from "./config.js";
import { SandboxRunner } from "./sandbox-runner.js";

export class RunCancelledError extends Error {
  constructor() {
    super("Run was cancelled by operator.");
    this.name = "RunCancelledError";
  }
}

export interface ClaimedAgentRun {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  projectRepositoryId: string | null;
  status: string;
  requestedPhase: string;
  repoFullName: string;
  baseBranch: string;
  baseCommitSha: string | null;
  userInstructions: string | null;
}

export interface WorkerDependencies {
  prisma: PrismaClient;
  config: WorkerConfig;
  sandboxRunner?: SandboxRunner;
  createGitHubClient?: () => GitHubSourceClient;
  createAiClient?: () => AiProviderClient;
}

export class AgentWorkerProcessor {
  private readonly sandboxRunner: SandboxRunner;

  constructor(private readonly deps: WorkerDependencies) {
    this.sandboxRunner =
      deps.sandboxRunner ??
      new SandboxRunner({
        sandboxEnabled: deps.config.sandboxEnabled,
        dockerImage: deps.config.sandboxDockerImage,
        timeoutMs: deps.config.sandboxTimeoutMs,
      });
  }

  private createGitHubClient(): GitHubSourceClient {
    if (this.deps.createGitHubClient) {
      return this.deps.createGitHubClient();
    }
    if (!this.deps.config.github) {
      throw new Error("GitHub App credentials are missing in worker environment.");
    }
    return new GitHubSourceClient(this.deps.config.github);
  }

  private createAiClient(): AiProviderClient {
    if (this.deps.createAiClient) {
      return this.deps.createAiClient();
    }
    if (!this.deps.config.ai) {
      throw new Error("AI provider configuration (AI_PROVIDER, AI_MODEL, AI_API_KEY) is missing in worker environment.");
    }
    return new AiProviderClient(this.deps.config.ai);
  }

  async claimNextRun(): Promise<ClaimedAgentRun | null> {
    const now = new Date();
    const candidates = await this.deps.prisma.agentRun.findMany({
      where: {
        cancelRequestedAt: null,
        attemptCount: { lt: 5 },
        OR: [
          { status: "QUEUED", workerId: null },
          { status: "RUNNING", workerId: null },
          { status: { in: ["PLANNING", "RUNNING"] }, leaseExpiresAt: { lt: now } },
        ],
      },
      orderBy: [{ createdAt: "asc" }],
      take: 5,
    });

    for (const candidate of candidates) {
      const claimStatus = candidate.status === "QUEUED" ? "PLANNING" : candidate.status;
      const leaseExpiresAt = new Date(Date.now() + this.deps.config.leaseDurationMs);

      const claimed = await this.deps.prisma.agentRun.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
          workerId: candidate.workerId,
          cancelRequestedAt: null,
        },
        data: {
          status: claimStatus,
          workerId: this.deps.config.workerId,
          leaseExpiresAt,
          attemptCount: { increment: 1 },
          startedAt: candidate.startedAt ?? now,
          currentStage:
            claimStatus === "PLANNING" ? "COLLECTING_CONTEXT" : "PREPARING_EXECUTION",
        },
      });

      if (claimed.count === 1) {
        return {
          id: candidate.id,
          organizationId: candidate.organizationId,
          projectId: candidate.projectId,
          taskId: candidate.taskId,
          projectRepositoryId: candidate.projectRepositoryId,
          status: claimStatus,
          requestedPhase: candidate.requestedPhase,
          repoFullName: candidate.repoFullName,
          baseBranch: candidate.baseBranch,
          baseCommitSha: candidate.baseCommitSha,
          userInstructions: candidate.userInstructions,
        };
      }
    }

    return null;
  }

  private async ensureNotCancelled(runId: string): Promise<void> {
    const run = await this.deps.prisma.agentRun.findUnique({
      where: { id: runId },
      select: { status: true, cancelRequestedAt: true },
    });
    if (!run || run.status === "CANCELLED" || run.cancelRequestedAt !== null) {
      throw new RunCancelledError();
    }
  }

  private async renewLease(runId: string): Promise<void> {
    await this.deps.prisma.agentRun.updateMany({
      where: {
        id: runId,
        workerId: this.deps.config.workerId,
        cancelRequestedAt: null,
      },
      data: {
        leaseExpiresAt: new Date(Date.now() + this.deps.config.leaseDurationMs),
      },
    });
  }

  async processNextOnce(): Promise<boolean> {
    const claimed = await this.claimNextRun();
    if (!claimed) return false;
    await this.processClaimedRun(claimed);
    return true;
  }

  async processClaimedRun(claimed: ClaimedAgentRun): Promise<void> {
    const renewIntervalMs = Math.max(10_000, Math.floor(this.deps.config.leaseDurationMs / 3));
    const timer = setInterval(() => {
      void this.renewLease(claimed.id).catch(() => {});
    }, renewIntervalMs);

    const tempWorkDir = await mkdtemp(path.join(tmpdir(), `devcollab-run-${claimed.id.slice(-8)}-`));

    try {
      if (claimed.requestedPhase === "EXECUTE") {
        await this.runExecutionPhase(claimed, tempWorkDir);
      } else {
        await this.runPlanningPhase(claimed);
      }
    } catch (error) {
      if (error instanceof RunCancelledError) {
        return;
      }
      const message = scrubSecrets(
        error instanceof Error ? error.message : String(error),
        [this.deps.config.ai?.apiKey, this.deps.config.github?.privateKey],
      );
      const code =
        (error as { code?: string; name?: string })?.code ??
        (error instanceof Error ? error.name : "WORKER_ERROR");

      await this.deps.prisma.$transaction(async (tx) => {
        const current = await tx.agentRun.findUnique({
          where: { id: claimed.id },
          select: { status: true, cancelRequestedAt: true },
        });
        if (!current || current.status === "CANCELLED" || current.cancelRequestedAt) {
          return;
        }
        await tx.agentRun.update({
          where: { id: claimed.id },
          data: {
            status: "FAILED",
            currentStage: "FAILED",
            errorCode: String(code).slice(0, 64),
            errorMessage: message.slice(0, 2000),
            completedAt: new Date(),
            workerId: null,
            leaseExpiresAt: null,
          },
        });
        await tx.agentRunEvent.create({
          data: {
            runId: claimed.id,
            organizationId: claimed.organizationId,
            projectId: claimed.projectId,
            eventType: "RUN_FAILED",
            statusFrom: current.status,
            statusTo: "FAILED",
            message: message.slice(0, 500),
            metadata: { errorCode: code },
          },
        });
      });
    } finally {
      clearInterval(timer);
      await rm(tempWorkDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async runPlanningPhase(claimed: ClaimedAgentRun): Promise<void> {
    await this.ensureNotCancelled(claimed.id);
    const github = this.createGitHubClient();
    const ai = this.createAiClient();

    const [task, repo, priorPlans] = await Promise.all([
      this.deps.prisma.task.findUniqueOrThrow({ where: { id: claimed.taskId } }),
      this.deps.prisma.projectRepository.findFirst({
        where: {
          id: claimed.projectRepositoryId ?? undefined,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          status: "CONNECTED",
        },
        include: { installation: true },
      }),
      this.deps.prisma.agentPlan.findMany({
        where: { runId: claimed.id },
        orderBy: [{ version: "desc" }],
        take: 1,
      }),
    ]);

    if (!repo || repo.installation.status !== "ACTIVE") {
      throw new Error("Connected GitHub repository or installation is no longer active.");
    }

    const baseSha =
      claimed.baseCommitSha ||
      (
        await github.getBranch(
          repo.installation.githubInstallationId,
          repo.owner,
          repo.name,
          claimed.baseBranch,
        )
      ).commit.sha;

    const treeResp = await github.getTree(
      repo.installation.githubInstallationId,
      repo.owner,
      repo.name,
      baseSha,
      true,
    );

    let gitignoreText: string | null = null;
    if (treeResp.tree.some((item) => item.path === ".gitignore")) {
      const gi = await github
        .getFileContent(repo.installation.githubInstallationId, repo.owner, repo.name, ".gitignore", baseSha)
        .catch(() => null);
      gitignoreText = gi?.contentText ?? null;
    }

    const selection = selectRepositoryContextCandidates({
      tree: treeResp.tree,
      gitignoreText,
      taskTitle: task.title,
      taskDescription: task.description,
      taskLabels: task.labels,
      userInstructions: claimed.userInstructions,
      maxFiles: this.deps.config.maxContextFiles,
    });

    const selectedFiles: AgentContextFileDto[] = [];
    const framedContents: Array<{ path: string; content: string }> = [];
    let totalBytes = 0;

    for (const relPath of selection.selectedPaths) {
      await this.ensureNotCancelled(claimed.id);
      if (totalBytes >= this.deps.config.maxContextBytes) break;

      const fileRes = await github
        .getFileContent(repo.installation.githubInstallationId, repo.owner, repo.name, relPath, baseSha)
        .catch(() => null);
      if (!fileRes || fileRes.isBinary || fileRes.contentText === null) continue;

      const remaining = Math.max(1024, this.deps.config.maxContextBytes - totalBytes);
      const maxPerFile = Math.min(remaining, 18_000);
      const clipped = truncateContextFileContent(fileRes.contentText, maxPerFile);
      const byteLen = Buffer.byteLength(clipped.text, "utf8");
      totalBytes += byteLen;

      selectedFiles.push({ path: relPath, bytes: byteLen, truncated: clipped.truncated });
      framedContents.push({ path: relPath, content: clipped.text });
    }

    await this.deps.prisma.agentRun.updateMany({
      where: { id: claimed.id, cancelRequestedAt: null },
      data: { currentStage: "PLANNER_MODEL", baseCommitSha: baseSha },
    });

    await this.deps.prisma.agentRunEvent.create({
      data: {
        runId: claimed.id,
        organizationId: claimed.organizationId,
        projectId: claimed.projectId,
        eventType: "CONTEXT_COLLECTED",
        statusFrom: "PLANNING",
        statusTo: "PLANNING",
        message: `Collected ${selectedFiles.length} repository files (${selection.indexedFileCount} indexed; ${selection.excludedCount} excluded by safety/gitignore filters).`,
      },
    });

    const previousRevisionNote =
      priorPlans[0]?.status === "SUPERSEDED" ? priorPlans[0].decisionNote : null;

    const { plan, usage } = await ai.generatePlan({
      taskIdentifier: task.identifier,
      taskTitle: task.title,
      taskDescription: task.description,
      repoFullName: repo.fullName,
      baseBranch: claimed.baseBranch,
      framedFilesContext: frameUntrustedRepoFiles(framedContents),
      userInstructions: claimed.userInstructions,
      revisionFeedback: previousRevisionNote,
    });

    const nextVersion = (priorPlans[0]?.version ?? 0) + 1;

    await this.deps.prisma.$transaction(async (tx) => {
      const current = await tx.agentRun.findUnique({
        where: { id: claimed.id },
        select: { status: true, cancelRequestedAt: true },
      });
      if (!current || current.status === "CANCELLED" || current.cancelRequestedAt) {
        throw new RunCancelledError();
      }

      const createdPlan = await tx.agentPlan.create({
        data: {
          runId: claimed.id,
          version: nextVersion,
          status: "PENDING",
          summary: plan.summary,
          steps: plan.steps as unknown as object,
          targetFiles: plan.targetFiles,
          risks: plan.risks,
          suggestedChecks: plan.suggestedChecks,
          revisionFeedback: previousRevisionNote,
          contextSummary: {
            repoFullName: repo.fullName,
            baseBranch: claimed.baseBranch,
            baseCommitSha: baseSha,
            indexedFileCount: selection.indexedFileCount,
            selectedFiles,
            excludedReasonSummary: `${selection.excludedCount} ignored, binary, oversized, or secret files excluded.`,
          } as unknown as object,
        },
      });

      await this.recordUsageInTx(tx, claimed, usage);

      await tx.agentRun.update({
        where: { id: claimed.id },
        data: {
          status: "AWAITING_APPROVAL",
          currentStage: "AWAITING_PLAN_APPROVAL",
          activePlanId: createdPlan.id,
          baseCommitSha: baseSha,
          workerId: null,
          leaseExpiresAt: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: claimed.id,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          eventType: "PLAN_GENERATED",
          statusFrom: "PLANNING",
          statusTo: "AWAITING_APPROVAL",
          message: `Generated implementation plan v${nextVersion}; waiting for human approval before execution.`,
        },
      });
    });
  }

  private async runExecutionPhase(claimed: ClaimedAgentRun, tempWorkDir: string): Promise<void> {
    await this.ensureNotCancelled(claimed.id);
    const github = this.createGitHubClient();
    const ai = this.createAiClient();

    const [task, repo, approvedPlan, priorProposals] = await Promise.all([
      this.deps.prisma.task.findUniqueOrThrow({ where: { id: claimed.taskId } }),
      this.deps.prisma.projectRepository.findFirst({
        where: {
          id: claimed.projectRepositoryId ?? undefined,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          status: "CONNECTED",
        },
        include: { installation: true },
      }),
      this.deps.prisma.agentPlan.findFirst({
        where: { runId: claimed.id, status: "APPROVED" },
        orderBy: [{ version: "desc" }],
      }),
      this.deps.prisma.agentProposal.findMany({
        where: { runId: claimed.id },
        orderBy: [{ version: "desc" }],
        take: 1,
      }),
    ]);

    if (!approvedPlan) {
      throw new Error("Execution refused: no approved implementation plan found.");
    }
    if (!repo || repo.installation.status !== "ACTIVE") {
      throw new Error("Connected GitHub repository or installation is no longer active.");
    }
    if (!claimed.baseCommitSha) {
      throw new Error("Execution refused: run is missing baseCommitSha snapshot.");
    }

    await this.deps.prisma.agentRunEvent.create({
      data: {
        runId: claimed.id,
        organizationId: claimed.organizationId,
        projectId: claimed.projectId,
        eventType: "EXECUTION_CLAIMED",
        statusFrom: "RUNNING",
        statusTo: "RUNNING",
        message: `Worker ${this.deps.config.workerId} claimed approved plan v${approvedPlan.version}; downloading snapshot ${claimed.baseCommitSha.slice(0, 7)}.`,
      },
    });

    const tarballBuf = await github.downloadRepositoryTarball(
      repo.installation.githubInstallationId,
      repo.owner,
      repo.name,
      claimed.baseCommitSha,
    );
    await extractSafeTarGz(tarballBuf, tempWorkDir);
    await this.ensureNotCancelled(claimed.id);

    const contextSummary = (approvedPlan.contextSummary ?? {}) as {
      selectedFiles?: Array<{ path: string }>;
    };
    const candidatePaths = Array.from(
      new Set([
        ...approvedPlan.targetFiles,
        ...(contextSummary.selectedFiles?.map((f) => f.path) ?? []),
        "package.json",
      ]),
    ).filter((p) => !isSensitiveOrBlockedPath(p));

    const framedContents: Array<{ path: string; content: string }> = [];
    let totalBytes = 0;

    for (const relPath of candidatePaths.slice(0, this.deps.config.maxContextFiles)) {
      if (totalBytes >= this.deps.config.maxContextBytes) break;
      const target = path.resolve(tempWorkDir, relPath);
      if (!target.startsWith(`${path.resolve(tempWorkDir)}${path.sep}`)) continue;
      const content = await readFile(target, "utf8").catch(() => null);
      if (content === null || content.includes("\0")) continue;
      const clipped = truncateContextFileContent(
        content,
        Math.min(20_000, this.deps.config.maxContextBytes - totalBytes),
      );
      totalBytes += Buffer.byteLength(clipped.text, "utf8");
      framedContents.push({ path: relPath, content: clipped.text });
    }

    await this.deps.prisma.agentRun.updateMany({
      where: { id: claimed.id, cancelRequestedAt: null },
      data: { currentStage: "IMPLEMENTER_MODEL" },
    });

    const previousProposalFeedback =
      priorProposals[0]?.status === "REVISION_REQUESTED" ? priorProposals[0].reviewNote : null;

    const approvedSteps = Array.isArray(approvedPlan.steps)
      ? (approvedPlan.steps as unknown as AgentPlanStepDto[])
      : [];

    const { implementation, usage: implUsage } = await ai.generateImplementation({
      taskIdentifier: task.identifier,
      taskTitle: task.title,
      taskDescription: task.description,
      repoFullName: repo.fullName,
      baseCommitSha: claimed.baseCommitSha,
      approvedPlanSummary: approvedPlan.summary,
      approvedSteps,
      framedFilesContext: frameUntrustedRepoFiles(framedContents),
      revisionFeedback: previousProposalFeedback,
    });

    await this.ensureNotCancelled(claimed.id);

    // Strictly validate unified diff & apply inside temp workspace BEFORE any tests/review
    let validated;
    try {
      validated = validateAndParseUnifiedDiff(implementation.rawPatch);
      await applyValidatedPatchToDirectory(tempWorkDir, validated);
    } catch (patchErr) {
      await this.deps.prisma.$transaction(async (tx) => {
        await this.recordUsageInTx(tx, claimed, implUsage);
        await tx.agentRunEvent.create({
          data: {
            runId: claimed.id,
            organizationId: claimed.organizationId,
            projectId: claimed.projectId,
            eventType: "PATCH_REJECTED",
            statusFrom: "RUNNING",
            statusTo: "FAILED",
            message: patchErr instanceof Error ? patchErr.message : "Patch validation failed.",
          },
        });
      });
      throw patchErr;
    }

    await this.deps.prisma.agentRunEvent.create({
      data: {
        runId: claimed.id,
        organizationId: claimed.organizationId,
        projectId: claimed.projectId,
        eventType: "PATCH_VALIDATED",
        statusFrom: "RUNNING",
        statusTo: "RUNNING",
        message: `Validated patch across ${validated.filesChangedCount} file(s) (+${validated.additionsCount}/-${validated.deletionsCount}).`,
      },
    });

    await this.deps.prisma.agentRun.updateMany({
      where: { id: claimed.id, cancelRequestedAt: null },
      data: { currentStage: "SANDBOX_CHECKS" },
    });

    const combinedSuggestedChecks = Array.from(
      new Set([...approvedPlan.suggestedChecks, ...implementation.suggestedChecks]),
    );
    const testResult = await this.sandboxRunner.runChecks(tempWorkDir, combinedSuggestedChecks);

    await this.ensureNotCancelled(claimed.id);

    await this.deps.prisma.agentRun.updateMany({
      where: { id: claimed.id, cancelRequestedAt: null },
      data: { currentStage: "REVIEWER_MODEL" },
    });

    const { review, usage: reviewUsage } = await ai.generateReview({
      taskIdentifier: task.identifier,
      taskTitle: task.title,
      approvedPlanSummary: approvedPlan.summary,
      rawPatch: validated.rawPatch,
      testStatusSummary: `${testResult.status}: ${testResult.explanation}`,
    });

    const nextVersion = (priorProposals[0]?.version ?? 0) + 1;

    await this.deps.prisma.$transaction(async (tx) => {
      const current = await tx.agentRun.findUnique({
        where: { id: claimed.id },
        select: { status: true, cancelRequestedAt: true },
      });
      if (!current || current.status === "CANCELLED" || current.cancelRequestedAt) {
        throw new RunCancelledError();
      }

      const createdProposal = await tx.agentProposal.create({
        data: {
          runId: claimed.id,
          planId: approvedPlan.id,
          version: nextVersion,
          status: "PENDING_REVIEW",
          summary: implementation.summary,
          reviewSummary: review.reviewSummary,
          reviewFindings: review.findings as unknown as object,
          changedFiles: validated.changedFiles as unknown as object,
          rawPatch: validated.rawPatch,
          filesChangedCount: validated.filesChangedCount,
          additionsCount: validated.additionsCount,
          deletionsCount: validated.deletionsCount,
          baseCommitSha: claimed.baseCommitSha!,
          revisionFeedback: previousProposalFeedback,
        },
      });

      await tx.agentTestRun.create({
        data: {
          runId: claimed.id,
          proposalId: createdProposal.id,
          status: testResult.status,
          command: testResult.command,
          exitCode: testResult.exitCode,
          durationMs: testResult.durationMs,
          stdoutExcerpt: testResult.stdoutExcerpt,
          stderrExcerpt: testResult.stderrExcerpt,
          explanation: testResult.explanation,
          sandboxed: testResult.sandboxed,
          completedAt: new Date(),
        },
      });

      await this.recordUsageInTx(tx, claimed, implUsage);
      await this.recordUsageInTx(tx, claimed, reviewUsage);

      await tx.agentRunEvent.create({
        data: {
          runId: claimed.id,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          eventType: testResult.sandboxed ? "TESTS_EXECUTED" : "TESTS_UNAVAILABLE",
          statusFrom: "RUNNING",
          statusTo: "RUNNING",
          message: testResult.explanation,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: claimed.id,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          eventType: "REVIEW_GENERATED",
          statusFrom: "RUNNING",
          statusTo: "RUNNING",
          message: `Reviewer produced ${review.findings.length} finding(s).`,
        },
      });

      await tx.agentRun.update({
        where: { id: claimed.id },
        data: {
          status: "AWAITING_REVIEW",
          currentStage: "AWAITING_HUMAN_REVIEW",
          activeProposalId: createdProposal.id,
          workerId: null,
          leaseExpiresAt: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: claimed.id,
          organizationId: claimed.organizationId,
          projectId: claimed.projectId,
          eventType: "PROPOSAL_CREATED",
          statusFrom: "RUNNING",
          statusTo: "AWAITING_REVIEW",
          message: `Proposal v${nextVersion} ready for human diff review.`,
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: claimed.taskId,
          projectId: claimed.projectId,
          eventType: "AI_PROPOSAL_READY",
          field: "agentProposal",
          newValue: createdProposal.id,
          summary: `AI proposal v${nextVersion} ready for review (${validated.filesChangedCount} files changed)`,
        },
      });
    });
  }

  private async recordUsageInTx(
    tx: Pick<PrismaClient, "agentUsageRecord">,
    claimed: ClaimedAgentRun,
    usage: AiStageUsage,
  ): Promise<void> {
    await tx.agentUsageRecord.create({
      data: {
        runId: claimed.id,
        organizationId: claimed.organizationId,
        projectId: claimed.projectId,
        stageRole: usage.stageRole,
        provider: usage.provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.totalTokens,
        estimatedCostUsd: usage.estimatedCostUsd,
        latencyMs: usage.latencyMs,
      },
    });
  }
}
