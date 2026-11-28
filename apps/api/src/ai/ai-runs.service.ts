import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AgentCapabilityStatusDto,
  AgentRunDetailDto,
  AgentRunStatus,
  ProjectAiOverviewDto,
  TaskAgentWorkspaceDto,
} from "@devcollab/shared";
import { scrubSecrets } from "@devcollab/ai-core";
import { AnalyticsCacheService } from "../analytics/analytics-cache.service";
import type { ProjectContext } from "../authorization/authorization.constants";
import { DatabaseService } from "../database/database.service";
import { GitHubApiError, GitHubAppClientService } from "../github/github-app-client.service";
import { GitHubConfigService } from "../github/github-config.service";
import { TasksService } from "../tasks/tasks.service";
import { AiConfigService } from "./ai-config.service";
import { sumUsageTotals, toAgentRunDetailDto, toAgentRunSummaryDto } from "./ai.mappers";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

export const ACTIVE_AGENT_RUN_STATUSES: AgentRunStatus[] = [
  "QUEUED",
  "PLANNING",
  "AWAITING_APPROVAL",
  "RUNNING",
  "AWAITING_REVIEW",
];

const CANCELLABLE_RUN_STATUSES: AgentRunStatus[] = [
  "QUEUED",
  "PLANNING",
  "AWAITING_APPROVAL",
  "RUNNING",
  "AWAITING_REVIEW",
];

export function computeTaskSnapshotHash(task: {
  title: string;
  description: string | null;
  status: string;
  priority: string;
  labels: string[];
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        labels: [...task.labels].sort(),
      }),
    )
    .digest("hex");
}

function optionalBoundedString(value: unknown, maxLen: number, fieldName: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new BadRequestException(`${fieldName} must be text.`);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLen) {
    throw new BadRequestException(`${fieldName} exceeds ${maxLen} characters.`);
  }
  return trimmed;
}

@Injectable()
export class AiRunsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly aiConfig: AiConfigService,
    private readonly githubConfig: GitHubConfigService,
    private readonly githubClient: GitHubAppClientService,
    @Optional() private readonly tasks?: TasksService,
    @Optional() private readonly analyticsCache?: AnalyticsCacheService,
  ) {}

  private evaluateStaleContext(
    run: {
      taskSnapshotHash: string;
      projectRepositoryId: string | null;
    },
    task: {
      archivedAt: Date | null;
      title: string;
      description: string | null;
      status: string;
      priority: string;
      labels: string[];
    },
    connectedRepoId: string | null,
  ): { isStale: boolean; reason: string | null } {
    if (task.archivedAt !== null) {
      return {
        isStale: true,
        reason: "This task was archived after the AI run captured its baseline context.",
      };
    }
    const currentHash = computeTaskSnapshotHash(task);
    if (currentHash !== run.taskSnapshotHash) {
      return {
        isStale: true,
        reason:
          "Task fields (title, description, status, priority, or labels) changed after the plan context was captured.",
      };
    }
    if (run.projectRepositoryId && connectedRepoId !== run.projectRepositoryId) {
      return {
        isStale: true,
        reason: "The connected project GitHub repository changed or was disconnected.",
      };
    }
    return { isStale: false, reason: null };
  }

  private async inferWorkerStatus(
    orgId: string,
    projectId: string,
  ): Promise<AgentCapabilityStatusDto["workerStatus"]> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - 45_000);
    const [leasedRun, waitingUnclaimedRun] = await Promise.all([
      this.db.prisma.agentRun.findFirst({
        where: {
          organizationId: orgId,
          projectId,
          workerId: { not: null },
          leaseExpiresAt: { gt: now },
        },
        select: { id: true },
      }),
      this.db.prisma.agentRun.findFirst({
        where: {
          organizationId: orgId,
          projectId,
          status: { in: ["QUEUED", "RUNNING"] },
          workerId: null,
          updatedAt: { lt: staleThreshold },
        },
        select: { id: true },
      }),
    ]);

    if (leasedRun) return "ONLINE";
    if (waitingUnclaimedRun) return "OFFLINE";
    return "IDLE";
  }

  async getCapabilityStatus(
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
    taskId?: string,
  ): Promise<AgentCapabilityStatusDto> {
    const ai = this.aiConfig.getConfiguration();
    const [repo, sandbox, workerStatus, task, activeTaskRun] = await Promise.all([
      this.db.prisma.projectRepository.findFirst({
        where: { organizationId: orgId, projectId, status: "CONNECTED" },
        include: { installation: { select: { status: true } } },
      }),
      this.aiConfig.checkSandboxAvailability(),
      this.inferWorkerStatus(orgId, projectId),
      taskId
        ? this.db.prisma.task.findFirst({
            where: { id: taskId, organizationId: orgId, projectId },
            select: { id: true, archivedAt: true },
          })
        : Promise.resolve(null),
      taskId
        ? this.db.prisma.agentRun.findFirst({
            where: {
              organizationId: orgId,
              projectId,
              taskId,
              status: { in: ACTIVE_AGENT_RUN_STATUSES },
            },
            select: { id: true, status: true },
          })
        : Promise.resolve(null),
    ]);

    const aiConfigured = this.aiConfig.isConfigured();
    const githubConfigured = this.githubConfig.getStatus().configured;
    const repositoryConnected = Boolean(repo && repo.installation.status === "ACTIVE");
    const blockingReasons: string[] = [];

    if (!projectContext.canRunAi) {
      blockingReasons.push(
        "AI runs require Owner, Admin, Project Manager, or explicit Developer AI permission on this project.",
      );
    }
    if (projectContext.project.status !== "ACTIVE") {
      blockingReasons.push("Archived projects cannot start AI runs.");
    }
    if (!repositoryConnected) {
      blockingReasons.push(
        "Connect an active GitHub repository in Project -> Repository before starting AI agents.",
      );
    }
    if (!githubConfigured) {
      blockingReasons.push("GitHub App credentials are not configured on the API server.");
    }
    if (!aiConfigured) {
      blockingReasons.push(
        "AI provider credentials (AI_PROVIDER, AI_MODEL, AI_API_KEY) are not configured on the server.",
      );
    }
    if (taskId && !task) {
      blockingReasons.push("Task not found in this project.");
    } else if (task?.archivedAt) {
      blockingReasons.push("Task is archived; restore it before running AI agents.");
    }
    if (activeTaskRun) {
      blockingReasons.push(`An AI run is already active for this task (${activeTaskRun.status}).`);
    }

    return {
      projectId,
      ...(taskId ? { taskId } : {}),
      canTriggerAi: projectContext.canRunAi,
      canApproveAi: projectContext.canRunAi,
      canManageAiPolicy: projectContext.canManage,
      allowDeveloperAiRuns: projectContext.project.allowDeveloperAiRuns,
      aiConfigured,
      provider: ai.provider ?? null,
      model: ai.model ?? null,
      repositoryConnected,
      repoFullName: repo?.fullName ?? null,
      defaultBranch: repo?.defaultBranch ?? null,
      sandboxEnabled: sandbox.enabled,
      sandboxAvailable: sandbox.available,
      sandboxReason: sandbox.reason,
      workerStatus,
      blockingReasons,
    };
  }

  async getProjectOverview(
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
  ): Promise<ProjectAiOverviewDto> {
    const [capability, runs, usageRows] = await Promise.all([
      this.getCapabilityStatus(orgId, projectId, projectContext),
      this.db.prisma.agentRun.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: [{ createdAt: "desc" }],
        take: 25,
        include: {
          triggeredBy: { select: USER_SELECT },
          usageRecords: true,
        },
      }),
      this.db.prisma.agentUsageRecord.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: [{ createdAt: "desc" }],
        take: 250,
      }),
    ]);

    return {
      capability,
      runs: runs.map(toAgentRunSummaryDto),
      usageSummary: sumUsageTotals(usageRows),
    };
  }

  async getTaskWorkspace(
    orgId: string,
    projectId: string,
    taskId: string,
    actorUserId: string,
    projectContext: ProjectContext,
    selectedRunId?: string,
  ): Promise<TaskAgentWorkspaceDto> {
    if (!this.tasks) {
      throw new ServiceUnavailableException("Task service unavailable.");
    }
    const [task, capability, runs] = await Promise.all([
      this.tasks.getTaskDetail(
        orgId,
        projectId,
        taskId,
        actorUserId,
        projectContext.canManage,
        projectContext.canRunAi,
      ),
      this.getCapabilityStatus(orgId, projectId, projectContext, taskId),
      this.db.prisma.agentRun.findMany({
        where: { organizationId: orgId, projectId, taskId },
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        include: {
          triggeredBy: { select: USER_SELECT },
          usageRecords: true,
        },
      }),
    ]);

    const targetRunId =
      selectedRunId && runs.some((r) => r.id === selectedRunId)
        ? selectedRunId
        : runs[0]?.id ?? null;

    const selectedRun = targetRunId
      ? await this.getRunDetail(orgId, projectId, targetRunId, projectContext)
      : null;

    return {
      task,
      capability,
      runs: runs.map(toAgentRunSummaryDto),
      selectedRun,
    };
  }

  async startRun(
    actorUserId: string,
    orgId: string,
    projectId: string,
    taskId: string,
    projectContext: ProjectContext,
    body: {
      userInstructions?: unknown;
      baseBranch?: unknown;
      idempotencyKey?: unknown;
    },
  ): Promise<AgentRunDetailDto> {
    if (!projectContext.canRunAi) {
      throw new ForbiddenException(
        "AI coding agents require Owner, Admin, Project Manager, or explicit Developer AI permission.",
      );
    }
    if (projectContext.project.status !== "ACTIVE") {
      throw new BadRequestException("Cannot run AI agents on an archived project.");
    }

    const userInstructions = optionalBoundedString(body?.userInstructions, 2000, "Instructions");
    const requestedBranch = optionalBoundedString(body?.baseBranch, 120, "Base branch");
    const idempotencyKey = optionalBoundedString(body?.idempotencyKey, 120, "Idempotency key");

    if (idempotencyKey) {
      const existingByKey = await this.db.prisma.agentRun.findFirst({
        where: { projectId, organizationId: orgId, idempotencyKey },
        select: { id: true, taskId: true },
      });
      if (existingByKey) {
        if (existingByKey.taskId !== taskId) {
          throw new ConflictException("Idempotency key already used for a different task.");
        }
        return this.getRunDetail(orgId, projectId, existingByKey.id, projectContext);
      }
    }

    if (!this.aiConfig.isConfigured()) {
      throw new ServiceUnavailableException(
        "AI provider is not configured on this server (missing AI_PROVIDER, AI_MODEL, or AI_API_KEY).",
      );
    }
    if (!this.githubConfig.getStatus().configured) {
      throw new ServiceUnavailableException(
        "GitHub App credentials are not configured on this server.",
      );
    }

    const ai = this.aiConfig.getConfiguration();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [task, repo, activeTaskRun, orgActiveRuns, orgHourlyRuns] = await Promise.all([
      this.db.prisma.task.findFirst({
        where: { id: taskId, organizationId: orgId, projectId },
      }),
      this.db.prisma.projectRepository.findFirst({
        where: { organizationId: orgId, projectId, status: "CONNECTED" },
        include: { installation: true },
      }),
      this.db.prisma.agentRun.findFirst({
        where: {
          organizationId: orgId,
          projectId,
          taskId,
          status: { in: ACTIVE_AGENT_RUN_STATUSES },
        },
        select: { id: true, status: true },
      }),
      this.db.prisma.agentRun.count({
        where: {
          organizationId: orgId,
          status: { in: ["QUEUED", "PLANNING", "RUNNING"] },
        },
      }),
      this.db.prisma.agentRun.count({
        where: {
          organizationId: orgId,
          createdAt: { gte: oneHourAgo },
        },
      }),
    ]);

    if (!task) {
      throw new NotFoundException("Task not found in this project.");
    }
    if (task.archivedAt !== null) {
      throw new BadRequestException("Archived tasks cannot be executed by AI agents.");
    }
    if (activeTaskRun) {
      throw new ConflictException(
        `An AI run is already active for ${task.identifier} (${activeTaskRun.status}). Complete, review, or cancel it first.`,
      );
    }
    if (!repo || repo.installation.status !== "ACTIVE") {
      throw new BadRequestException(
        "Connect an active GitHub repository before running AI coding agents.",
      );
    }
    if (orgActiveRuns >= 5) {
      throw new ConflictException(
        "Organization AI worker queue capacity reached (5 concurrent active runs). Wait for a run to finish.",
      );
    }
    if (orgHourlyRuns >= 25) {
      throw new HttpException(
        "Hourly organization AI run quota reached (25 runs/hour).",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const baseBranch = requestedBranch ?? repo.defaultBranch;
    let baseCommitSha: string;
    try {
      const branchInfo = await this.githubClient.getBranch(
        repo.installation.githubInstallationId,
        repo.owner,
        repo.name,
        baseBranch,
      );
      if (!branchInfo?.commit?.sha) {
        throw new Error("Branch response missing commit SHA.");
      }
      baseCommitSha = branchInfo.commit.sha;
    } catch (error) {
      if (error instanceof GitHubApiError) {
        if (error.status === 403 || error.status === 404) {
          throw new BadRequestException(
            `Unable to read branch "${baseBranch}" on ${repo.fullName}. Verify the branch exists and the GitHub App has Repository Contents (Read-only) permission.`,
          );
        }
        throw new ServiceUnavailableException(
          scrubSecrets(error.message),
        );
      }
      throw new ServiceUnavailableException(
        error instanceof Error ? scrubSecrets(error.message) : "Unable to reach GitHub API.",
      );
    }

    const snapshotHash = computeTaskSnapshotHash(task);
    const run = await this.db.prisma.$transaction(async (tx) => {
      // Double-check active run inside transaction to prevent double-submit races
      const concurrent = await tx.agentRun.findFirst({
        where: {
          organizationId: orgId,
          projectId,
          taskId,
          status: { in: ACTIVE_AGENT_RUN_STATUSES },
        },
        select: { id: true },
      });
      if (concurrent) {
        throw new ConflictException(`An AI run is already active for ${task.identifier}.`);
      }

      const created = await tx.agentRun.create({
        data: {
          organizationId: orgId,
          projectId,
          taskId,
          projectRepositoryId: repo.id,
          triggeredById: actorUserId,
          status: "QUEUED",
          requestedPhase: "PLAN",
          currentStage: "QUEUED_PLANNING",
          idempotencyKey,
          repoFullName: repo.fullName,
          baseBranch,
          baseCommitSha,
          taskSnapshotTitle: task.title,
          taskSnapshotHash: snapshotHash,
          userInstructions,
          provider: ai.provider!,
          model: ai.model!,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: created.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "RUN_QUEUED",
          statusFrom: null,
          statusTo: "QUEUED",
          message: `Queued AI planning run against ${repo.fullName}@${baseCommitSha.slice(0, 7)} (${baseBranch}).`,
          metadata: {
            baseBranch,
            baseCommitSha,
            provider: ai.provider,
            model: ai.model,
          },
        },
      });

      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          projectId,
          actorId: actorUserId,
          eventType: "AI_RUN_STARTED",
          field: "agentRun",
          newValue: created.id,
          summary: `Started AI run on ${repo.fullName}@${baseCommitSha.slice(0, 7)}`,
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "AI_RUN_STARTED",
          summary: `Started AI coding agent run for ${task.identifier} (${repo.fullName})`,
          metadata: { runId: created.id, taskId: task.id, baseCommitSha },
        },
      });

      return created;
    });

    this.analyticsCache?.invalidateProject(orgId, projectId);
    return this.getRunDetail(orgId, projectId, run.id, projectContext);
  }

  async getRunDetail(
    orgId: string,
    projectId: string,
    runId: string,
    projectContext: ProjectContext,
  ): Promise<AgentRunDetailDto> {
    const [run, connectedRepo] = await Promise.all([
      this.db.prisma.agentRun.findFirst({
        where: { id: runId, organizationId: orgId, projectId },
        include: {
          triggeredBy: { select: USER_SELECT },
          task: {
            select: {
              identifier: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              labels: true,
              archivedAt: true,
            },
          },
          plans: {
            orderBy: [{ version: "desc" }],
            include: { decidedBy: { select: USER_SELECT } },
          },
          proposals: {
            orderBy: [{ version: "desc" }],
            include: { reviewedBy: { select: USER_SELECT } },
          },
          testRuns: {
            orderBy: [{ createdAt: "desc" }],
          },
          events: {
            orderBy: [{ createdAt: "asc" }],
            include: { actor: { select: USER_SELECT } },
          },
          usageRecords: {
            orderBy: [{ createdAt: "asc" }],
          },
        },
      }),
      this.db.prisma.projectRepository.findFirst({
        where: { organizationId: orgId, projectId, status: "CONNECTED" },
        select: { id: true },
      }),
    ]);

    if (!run) {
      throw new NotFoundException("AI run not found in this project.");
    }

    const stale = this.evaluateStaleContext(
      run,
      run.task,
      connectedRepo?.id ?? null,
    );

    return toAgentRunDetailDto(run, {
      canControlRun: projectContext.canRunAi,
      isStaleContext: stale.isStale,
      staleReason: stale.reason,
    });
  }

  async decidePlan(
    actorUserId: string,
    orgId: string,
    projectId: string,
    runId: string,
    projectContext: ProjectContext,
    body: {
      decision?: unknown;
      note?: unknown;
      acknowledgeStaleContext?: unknown;
    },
  ): Promise<AgentRunDetailDto> {
    if (!projectContext.canRunAi) {
      throw new ForbiddenException("Your role cannot approve or reject AI implementation plans.");
    }
    const decision = body?.decision;
    if (decision !== "APPROVE" && decision !== "REJECT" && decision !== "REVISE") {
      throw new BadRequestException("decision must be APPROVE, REJECT, or REVISE.");
    }
    const note = optionalBoundedString(body?.note, 2000, "Decision note");
    const acknowledgeStaleContext = body?.acknowledgeStaleContext === true;

    if (decision === "REVISE" && !note) {
      throw new BadRequestException("Provide revision feedback when requesting a revised plan.");
    }

    await this.db.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: runId, organizationId: orgId, projectId },
        include: {
          task: {
            select: {
              id: true,
              identifier: true,
              title: true,
              description: true,
              status: true,
              priority: true,
              labels: true,
              archivedAt: true,
            },
          },
        },
      });
      if (!run) {
        throw new NotFoundException("AI run not found in this project.");
      }
      if (run.status !== "AWAITING_APPROVAL") {
        throw new ConflictException(
          `Cannot decide plan while run is in ${run.status} state.`,
        );
      }

      const activePlan = run.activePlanId
        ? await tx.agentPlan.findFirst({ where: { id: run.activePlanId, runId: run.id } })
        : await tx.agentPlan.findFirst({
            where: { runId: run.id, status: "PENDING" },
            orderBy: [{ version: "desc" }],
          });
      if (!activePlan) {
        throw new ConflictException("No pending plan exists to review.");
      }

      const connectedRepo = await tx.projectRepository.findFirst({
        where: { organizationId: orgId, projectId, status: "CONNECTED" },
        select: { id: true },
      });

      const now = new Date();

      if (decision === "APPROVE") {
        const stale = this.evaluateStaleContext(run, run.task, connectedRepo?.id ?? null);
        if (stale.isStale && !acknowledgeStaleContext) {
          throw new ConflictException(
            `${stale.reason ?? "Task context changed."} Confirm stale-context approval or request a revised plan.`,
          );
        }

        await tx.agentPlan.update({
          where: { id: activePlan.id },
          data: {
            status: "APPROVED",
            decidedById: actorUserId,
            decidedAt: now,
            decisionNote: note,
          },
        });

        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: "RUNNING",
            requestedPhase: "EXECUTE",
            currentStage: "QUEUED_EXECUTION",
            workerId: null,
            leaseExpiresAt: null,
            errorCode: null,
            errorMessage: null,
          },
        });

        await tx.agentRunEvent.create({
          data: {
            runId: run.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "PLAN_APPROVED",
            statusFrom: "AWAITING_APPROVAL",
            statusTo: "RUNNING",
            message: `Approved plan v${activePlan.version}; queued isolated worker execution.`,
            metadata: note ? { note } : undefined,
          },
        });

        await tx.taskActivity.create({
          data: {
            taskId: run.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "AI_PLAN_APPROVED",
            field: "agentPlan",
            newValue: activePlan.id,
            summary: `Approved AI plan v${activePlan.version} for ${run.task.identifier}`,
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "AI_PLAN_APPROVED",
            summary: `Approved AI plan v${activePlan.version} for ${run.task.identifier}`,
            metadata: { runId: run.id, planId: activePlan.id },
          },
        });
        return;
      }

      if (decision === "REJECT") {
        await tx.agentPlan.update({
          where: { id: activePlan.id },
          data: {
            status: "REJECTED",
            decidedById: actorUserId,
            decidedAt: now,
            decisionNote: note,
          },
        });

        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: "REJECTED",
            currentStage: "PLAN_REJECTED",
            completedAt: now,
            workerId: null,
            leaseExpiresAt: null,
          },
        });

        await tx.agentRunEvent.create({
          data: {
            runId: run.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "PLAN_REJECTED",
            statusFrom: "AWAITING_APPROVAL",
            statusTo: "REJECTED",
            message: `Rejected plan v${activePlan.version}${note ? `: ${note}` : "."}`,
          },
        });

        await tx.taskActivity.create({
          data: {
            taskId: run.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "AI_PLAN_REJECTED",
            field: "agentPlan",
            newValue: activePlan.id,
            summary: `Rejected AI plan v${activePlan.version} for ${run.task.identifier}`,
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "AI_PLAN_REJECTED",
            summary: `Rejected AI plan v${activePlan.version} for ${run.task.identifier}`,
            metadata: { runId: run.id, planId: activePlan.id },
          },
        });
        return;
      }

      // REVISE
      await tx.agentPlan.update({
        where: { id: activePlan.id },
        data: {
          status: "SUPERSEDED",
          decidedById: actorUserId,
          decidedAt: now,
          decisionNote: note,
        },
      });

      const refreshedHash = computeTaskSnapshotHash(run.task);
      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "QUEUED",
          requestedPhase: "PLAN",
          currentStage: "QUEUED_PLAN_REVISION",
          taskSnapshotTitle: run.task.title,
          taskSnapshotHash: refreshedHash,
          workerId: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: run.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "PLAN_REVISION_REQUESTED",
          statusFrom: "AWAITING_APPROVAL",
          statusTo: "QUEUED",
          message: `Requested plan revision on v${activePlan.version}: ${note}`,
          metadata: { previousPlanId: activePlan.id, note },
        },
      });
    });

    this.analyticsCache?.invalidateProject(orgId, projectId);
    return this.getRunDetail(orgId, projectId, runId, projectContext);
  }

  async decideProposal(
    actorUserId: string,
    orgId: string,
    projectId: string,
    runId: string,
    projectContext: ProjectContext,
    body: {
      decision?: unknown;
      note?: unknown;
    },
  ): Promise<AgentRunDetailDto> {
    if (!projectContext.canRunAi) {
      throw new ForbiddenException("Your role cannot accept or reject AI proposals.");
    }
    const decision = body?.decision;
    if (decision !== "ACCEPT" && decision !== "REJECT" && decision !== "REVISE") {
      throw new BadRequestException("decision must be ACCEPT, REJECT, or REVISE.");
    }
    const note = optionalBoundedString(body?.note, 2000, "Review note");
    if (decision === "REVISE" && !note) {
      throw new BadRequestException("Provide revision feedback when requesting changes.");
    }

    await this.db.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: runId, organizationId: orgId, projectId },
        include: { task: { select: { identifier: true } } },
      });
      if (!run) {
        throw new NotFoundException("AI run not found in this project.");
      }
      if (run.status !== "AWAITING_REVIEW") {
        throw new ConflictException(
          `Cannot review proposal while run is in ${run.status} state.`,
        );
      }

      const activeProposal = run.activeProposalId
        ? await tx.agentProposal.findFirst({ where: { id: run.activeProposalId, runId: run.id } })
        : await tx.agentProposal.findFirst({
            where: { runId: run.id, status: "PENDING_REVIEW" },
            orderBy: [{ version: "desc" }],
          });
      if (!activeProposal) {
        throw new ConflictException("No pending code proposal exists to review.");
      }

      const now = new Date();

      if (decision === "ACCEPT") {
        await tx.agentProposal.update({
          where: { id: activeProposal.id },
          data: {
            status: "ACCEPTED",
            reviewedById: actorUserId,
            reviewedAt: now,
            reviewNote: note,
          },
        });

        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            currentStage: "COMPLETED",
            completedAt: now,
            workerId: null,
            leaseExpiresAt: null,
          },
        });

        await tx.agentRunEvent.create({
          data: {
            runId: run.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "PROPOSAL_ACCEPTED",
            statusFrom: "AWAITING_REVIEW",
            statusTo: "COMPLETED",
            message: `Accepted proposal v${activeProposal.version} internally in DevCollab.`,
            metadata: note ? { note } : undefined,
          },
        });

        await tx.taskActivity.create({
          data: {
            taskId: run.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "AI_PROPOSAL_ACCEPTED",
            field: "agentProposal",
            newValue: activeProposal.id,
            summary: `Accepted AI proposal v${activeProposal.version} internally`,
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "AI_PROPOSAL_ACCEPTED",
            summary: `Accepted AI proposal v${activeProposal.version} for ${run.task.identifier}`,
            metadata: { runId: run.id, proposalId: activeProposal.id },
          },
        });
        return;
      }

      if (decision === "REJECT") {
        await tx.agentProposal.update({
          where: { id: activeProposal.id },
          data: {
            status: "REJECTED",
            reviewedById: actorUserId,
            reviewedAt: now,
            reviewNote: note,
          },
        });

        await tx.agentRun.update({
          where: { id: run.id },
          data: {
            status: "REJECTED",
            currentStage: "PROPOSAL_REJECTED",
            completedAt: now,
            workerId: null,
            leaseExpiresAt: null,
          },
        });

        await tx.agentRunEvent.create({
          data: {
            runId: run.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "PROPOSAL_REJECTED",
            statusFrom: "AWAITING_REVIEW",
            statusTo: "REJECTED",
            message: `Rejected proposal v${activeProposal.version}${note ? `: ${note}` : "."}`,
          },
        });

        await tx.taskActivity.create({
          data: {
            taskId: run.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "AI_PROPOSAL_REJECTED",
            field: "agentProposal",
            newValue: activeProposal.id,
            summary: `Rejected AI proposal v${activeProposal.version}`,
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "AI_PROPOSAL_REJECTED",
            summary: `Rejected AI proposal v${activeProposal.version} for ${run.task.identifier}`,
            metadata: { runId: run.id, proposalId: activeProposal.id },
          },
        });
        return;
      }

      // REVISE: preserve activeProposal intact under REVISION_REQUESTED and re-queue execution
      await tx.agentProposal.update({
        where: { id: activeProposal.id },
        data: {
          status: "REVISION_REQUESTED",
          reviewedById: actorUserId,
          reviewedAt: now,
          reviewNote: note,
        },
      });

      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "RUNNING",
          requestedPhase: "EXECUTE",
          currentStage: "QUEUED_PROPOSAL_REVISION",
          workerId: null,
          leaseExpiresAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: run.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "PROPOSAL_REVISION_REQUESTED",
          statusFrom: "AWAITING_REVIEW",
          statusTo: "RUNNING",
          message: `Requested proposal revision on v${activeProposal.version}: ${note}`,
          metadata: { previousProposalId: activeProposal.id, note },
        },
      });
    });

    this.analyticsCache?.invalidateProject(orgId, projectId);
    return this.getRunDetail(orgId, projectId, runId, projectContext);
  }

  async cancelRun(
    actorUserId: string,
    orgId: string,
    projectId: string,
    runId: string,
    projectContext: ProjectContext,
  ): Promise<AgentRunDetailDto> {
    if (!projectContext.canRunAi) {
      throw new ForbiddenException("Your role cannot cancel AI runs.");
    }

    await this.db.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: runId, organizationId: orgId, projectId },
        include: { task: { select: { identifier: true } } },
      });
      if (!run) {
        throw new NotFoundException("AI run not found in this project.");
      }
      if (!CANCELLABLE_RUN_STATUSES.includes(run.status)) {
        throw new ConflictException(`Cannot cancel AI run in terminal ${run.status} state.`);
      }

      const now = new Date();
      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: "CANCELLED",
          cancelRequestedAt: now,
          completedAt: now,
          currentStage: "CANCELLED",
          workerId: null,
          leaseExpiresAt: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: run.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "RUN_CANCELLED",
          statusFrom: run.status,
          statusTo: "CANCELLED",
          message: "AI run cancelled by operator.",
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "AI_RUN_CANCELLED",
          summary: `Cancelled AI run for ${run.task.identifier}`,
          metadata: { runId: run.id },
        },
      });
    });

    this.analyticsCache?.invalidateProject(orgId, projectId);
    return this.getRunDetail(orgId, projectId, runId, projectContext);
  }

  async retryRun(
    actorUserId: string,
    orgId: string,
    projectId: string,
    runId: string,
    projectContext: ProjectContext,
  ): Promise<AgentRunDetailDto> {
    if (!projectContext.canRunAi) {
      throw new ForbiddenException("Your role cannot retry AI runs.");
    }
    if (!this.aiConfig.isConfigured()) {
      throw new ServiceUnavailableException("AI provider is not configured on this server.");
    }

    await this.db.prisma.$transaction(async (tx) => {
      const run = await tx.agentRun.findFirst({
        where: { id: runId, organizationId: orgId, projectId },
        include: {
          plans: { orderBy: [{ version: "desc" }], take: 3 },
        },
      });
      if (!run) {
        throw new NotFoundException("AI run not found in this project.");
      }
      if (run.status !== "FAILED") {
        throw new ConflictException(`Only FAILED runs can be retried (current status: ${run.status}).`);
      }

      const concurrent = await tx.agentRun.findFirst({
        where: {
          organizationId: orgId,
          projectId,
          taskId: run.taskId,
          id: { not: run.id },
          status: { in: ACTIVE_AGENT_RUN_STATUSES },
        },
        select: { id: true },
      });
      if (concurrent) {
        throw new ConflictException("Another AI run is currently active for this task.");
      }

      const approvedPlan = run.plans.find((p) => p.status === "APPROVED");
      const nextStatus: AgentRunStatus = approvedPlan ? "RUNNING" : "QUEUED";

      await tx.agentRun.update({
        where: { id: run.id },
        data: {
          status: nextStatus,
          requestedPhase: approvedPlan ? "EXECUTE" : "PLAN",
          currentStage: approvedPlan ? "QUEUED_EXECUTION" : "QUEUED_PLANNING",
          workerId: null,
          leaseExpiresAt: null,
          cancelRequestedAt: null,
          completedAt: null,
          errorCode: null,
          errorMessage: null,
        },
      });

      await tx.agentRunEvent.create({
        data: {
          runId: run.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "RUN_QUEUED",
          statusFrom: "FAILED",
          statusTo: nextStatus,
          message: approvedPlan
            ? "Retrying execution of approved plan."
            : "Retrying AI planning stage.",
        },
      });
    });

    this.analyticsCache?.invalidateProject(orgId, projectId);
    return this.getRunDetail(orgId, projectId, runId, projectContext);
  }
}
