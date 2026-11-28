import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  DevWorkspaceDto,
  DevWorkspaceStatus,
  IdeReviewableProposalDto,
  OrganizationRole,
  ProjectIdeOverviewDto,
  TaskSummaryDto,
  TaskUserRef,
  WorkspaceEventDto,
  WorkspaceEventType,
  WorkspaceSnapshotDto,
  WorkspaceSnapshotStatus,
  WorkspaceStorageMode,
  WorkspaceTerminalTicketDto,
} from "@devcollab/shared";
import { scrubSecrets } from "@devcollab/ai-core";
import { toAgentProposalDto } from "../ai/ai.mappers";
import type { ProjectContext } from "../authorization/authorization.constants";
import { toProjectDetailDto, toTaskSummaryDto } from "../common/mappers";
import { DatabaseService } from "../database/database.service";
import { GitHubApiError, GitHubAppClientService } from "../github/github-app-client.service";
import { GitHubConfigService } from "../github/github-config.service";
import { storageWarningForMode, WorkerClientService } from "./worker-client.service";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

const WRITABLE_WORKSPACE_STATUSES: DevWorkspaceStatus[] = ["READY", "ACTIVE"];

function toWorkspaceSnapshotDto(snap: {
  id: string;
  workspaceId: string;
  baseCommitSha: string;
  branchName: string;
  status: WorkspaceSnapshotStatus;
  sizeBytes: number;
  checksumSha256: string;
  trackedFileCount: number;
  untrackedFileCount: number;
  createdBy: TaskUserRef | null;
  createdAt: Date;
  restoredAt: Date | null;
}): WorkspaceSnapshotDto {
  return {
    id: snap.id,
    workspaceId: snap.workspaceId,
    baseCommitSha: snap.baseCommitSha,
    branchName: snap.branchName,
    status: snap.status,
    sizeBytes: snap.sizeBytes,
    checksumSha256: snap.checksumSha256,
    trackedFileCount: snap.trackedFileCount,
    untrackedFileCount: snap.untrackedFileCount,
    createdBy: snap.createdBy,
    createdAt: snap.createdAt.toISOString(),
    restoredAt: snap.restoredAt ? snap.restoredAt.toISOString() : null,
  };
}

function toWorkspaceEventDto(ev: {
  id: string;
  workspaceId: string;
  eventType: WorkspaceEventType;
  message: string;
  actor: TaskUserRef | null;
  createdAt: Date;
}): WorkspaceEventDto {
  return {
    id: ev.id,
    workspaceId: ev.workspaceId,
    eventType: ev.eventType,
    message: ev.message,
    actor: ev.actor,
    createdAt: ev.createdAt.toISOString(),
  };
}

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly worker: WorkerClientService,
    private readonly githubConfig: GitHubConfigService,
    private readonly githubClient: GitHubAppClientService,
  ) {}

  private canCreateWorkspace(projectContext: ProjectContext): boolean {
    return projectContext.canManage || projectContext.projectRole === "DEVELOPER";
  }

  private async expireStaleWorkspaces(orgId: string, projectId: string): Promise<void> {
    const now = new Date();
    await this.db.prisma.devWorkspace.updateMany({
      where: {
        organizationId: orgId,
        projectId,
        deletedAt: null,
        expiresAt: { lt: now },
        status: { in: ["READY", "ACTIVE", "SUSPENDED", "STOPPED"] },
      },
      data: { status: "EXPIRED" },
    });
  }

  private toDto(
    ws: {
      id: string;
      organizationId: string;
      projectId: string;
      projectRepositoryId: string | null;
      ownerId: string;
      owner: TaskUserRef;
      taskId: string | null;
      name: string;
      status: DevWorkspaceStatus;
      storageMode: WorkspaceStorageMode;
      storageWarning: string | null;
      repoFullName: string;
      baseBranch: string;
      baseCommitSha: string | null;
      currentBranch: string | null;
      lastCommitSha: string | null;
      dirtyFileCount: number;
      errorCode: string | null;
      errorMessage: string | null;
      lastActiveAt: Date;
      suspendedAt: Date | null;
      stoppedAt: Date | null;
      expiresAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
      snapshots: Array<Parameters<typeof toWorkspaceSnapshotDto>[0]>;
      events: Array<Parameters<typeof toWorkspaceEventDto>[0]>;
    },
    actorUserId: string,
    projectContext: ProjectContext,
    directoryPresent: boolean,
    terminalAvailable: boolean,
    collabRole?: "OWNER" | "EDITOR" | "VIEWER" | null,
  ): DevWorkspaceDto {
    const isOwner = ws.ownerId === actorUserId;
    const isWritableState = WRITABLE_WORKSPACE_STATUSES.includes(ws.status);
    const projectActive = projectContext.project.status === "ACTIVE";
    const canCollabWrite = collabRole === "OWNER" || collabRole === "EDITOR";
    return {
      id: ws.id,
      organizationId: ws.organizationId,
      projectId: ws.projectId,
      projectRepositoryId: ws.projectRepositoryId,
      ownerId: ws.ownerId,
      owner: ws.owner,
      taskId: ws.taskId,
      name: ws.name,
      status: ws.status,
      storageMode: ws.storageMode,
      storageWarning: ws.storageWarning,
      repoFullName: ws.repoFullName,
      baseBranch: ws.baseBranch,
      baseCommitSha: ws.baseCommitSha,
      currentBranch: ws.currentBranch,
      lastCommitSha: ws.lastCommitSha,
      dirtyFileCount: ws.dirtyFileCount,
      errorCode: ws.errorCode,
      errorMessage: ws.errorMessage,
      lastActiveAt: ws.lastActiveAt.toISOString(),
      suspendedAt: ws.suspendedAt ? ws.suspendedAt.toISOString() : null,
      stoppedAt: ws.stoppedAt ? ws.stoppedAt.toISOString() : null,
      expiresAt: ws.expiresAt ? ws.expiresAt.toISOString() : null,
      createdAt: ws.createdAt.toISOString(),
      updatedAt: ws.updatedAt.toISOString(),
      canWrite:
        projectActive && isWritableState && (isOwner || projectContext.canManage || canCollabWrite),
      canManage: isOwner || projectContext.canManage,
      canUseTerminal: projectActive && isWritableState && isOwner && terminalAvailable,
      directoryPresent,
      snapshots: ws.snapshots.map(toWorkspaceSnapshotDto),
      recentEvents: ws.events.map(toWorkspaceEventDto),
    };
  }

  private async resolveActiveCollabRole(
    actorUserId: string,
    workspaceId: string,
  ): Promise<"OWNER" | "EDITOR" | "VIEWER" | null> {
    if (!this.db.prisma.collabParticipant?.findFirst) {
      return null;
    }
    const participant = await this.db.prisma.collabParticipant.findFirst({
      where: {
        userId: actorUserId,
        status: "ACTIVE",
        session: {
          workspaceId,
          status: "ACTIVE",
        },
      },
      orderBy: [{ joinedAt: "desc" }],
      select: { role: true },
    });
    return participant?.role ?? null;
  }

  private async loadWorkspaceAndAuthorize(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    requireWritable = false,
  ) {
    if (!this.canCreateWorkspace(projectContext)) {
      throw new ForbiddenException(
        "Workspace access requires a Developer, Project Manager, Admin, or Owner role.",
      );
    }

    const ws = await this.db.prisma.devWorkspace.findFirst({
      where: {
        id: workspaceId,
        organizationId: orgId,
        projectId,
        deletedAt: null,
      },
      include: {
        owner: { select: USER_SELECT },
        snapshots: {
          orderBy: [{ createdAt: "desc" }],
          take: 10,
          include: { createdBy: { select: USER_SELECT } },
        },
        events: {
          orderBy: [{ createdAt: "desc" }],
          take: 25,
          include: { actor: { select: USER_SELECT } },
        },
      },
    });

    if (!ws) {
      throw new NotFoundException("Development workspace not found in this project.");
    }

    let collabRole: "OWNER" | "EDITOR" | "VIEWER" | null = null;
    if (ws.ownerId !== actorUserId && !projectContext.canManage) {
      collabRole = await this.resolveActiveCollabRole(actorUserId, ws.id);
      if (!collabRole) {
        throw new ForbiddenException(
          "This single-user development workspace belongs to another team member.",
        );
      }
    }

    if (requireWritable) {
      if (projectContext.project.status !== "ACTIVE") {
        throw new ForbiddenException("Cannot modify files inside an archived project.");
      }
      if (!WRITABLE_WORKSPACE_STATUSES.includes(ws.status)) {
        throw new ConflictException(
          `Workspace is currently ${ws.status}. Resume or reopen it before editing.`,
        );
      }
      if (collabRole === "VIEWER") {
        throw new ForbiddenException(
          "Read-only viewer role cannot modify files, branches, or Git state in this collaborative session.",
        );
      }
    }

    return Object.assign(ws, { collabRole });
  }

  async getProjectOverview(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
  ): Promise<ProjectIdeOverviewDto> {
    if (!this.canCreateWorkspace(projectContext)) {
      throw new ForbiddenException(
        "Browser IDE access is restricted to project developers, project managers, admins, and owners.",
      );
    }

    await this.expireStaleWorkspaces(orgId, projectId);

    const [capabilities, projectRow, repoRow, workspaceRows, taskRows, proposalRuns] =
      await Promise.all([
        this.worker.getRuntimeCapabilities(),
        this.db.prisma.project.findFirstOrThrow({
          where: { id: projectId, organizationId: orgId },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            roleAssignments: {
              orderBy: [{ role: "asc" }, { createdAt: "asc" }],
              include: { user: { select: USER_SELECT } },
            },
          },
        }),
        this.db.prisma.projectRepository.findFirst({
          where: { organizationId: orgId, projectId, status: "CONNECTED" },
          select: {
            id: true,
            fullName: true,
            owner: true,
            name: true,
            defaultBranch: true,
            isPrivate: true,
            htmlUrl: true,
            status: true,
            openPrCount: true,
            lastSyncedAt: true,
            lastSyncStatus: true,
            lastSyncError: true,
          },
        }),
        this.db.prisma.devWorkspace.findMany({
          where: {
            organizationId: orgId,
            projectId,
            deletedAt: null,
            ...(projectContext.canManage
              ? {}
              : {
                  OR: [
                    { ownerId: actorUserId },
                    {
                      collabSessions: {
                        some: {
                          status: "ACTIVE",
                          participants: {
                            some: {
                              userId: actorUserId,
                              status: "ACTIVE",
                            },
                          },
                        },
                      },
                    },
                  ],
                }),
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 20,
          include: {
            owner: { select: USER_SELECT },
            collabSessions: {
              where: { status: "ACTIVE" },
              select: {
                participants: {
                  where: { userId: actorUserId, status: "ACTIVE" },
                  select: { role: true },
                },
              },
            },
            snapshots: {
              orderBy: [{ createdAt: "desc" }],
              take: 5,
              include: { createdBy: { select: USER_SELECT } },
            },
            events: {
              orderBy: [{ createdAt: "desc" }],
              take: 10,
              include: { actor: { select: USER_SELECT } },
            },
          },
        }),
        this.db.prisma.task.findMany({
          where: { organizationId: orgId, projectId, archivedAt: null },
          orderBy: [{ updatedAt: "desc" }],
          take: 30,
          include: {
            assignee: { select: USER_SELECT },
            creator: { select: USER_SELECT },
            _count: { select: { comments: true } },
          },
        }),
        this.db.prisma.agentRun.findMany({
          where: {
            organizationId: orgId,
            projectId,
            status: { in: ["AWAITING_REVIEW", "COMPLETED"] },
            proposals: { some: {} },
          },
          orderBy: [{ updatedAt: "desc" }],
          take: 15,
          include: {
            task: { select: { id: true, identifier: true, title: true } },
            proposals: {
              orderBy: [{ version: "desc" }],
              take: 1,
              include: { reviewedBy: { select: USER_SELECT } },
            },
          },
        }),
      ]);

    const projectDto = {
      ...toProjectDetailDto(projectRow, actorUserId, actorOrgRole),
      repositorySummary: repoRow
        ? {
            id: repoRow.id,
            fullName: repoRow.fullName,
            owner: repoRow.owner,
            name: repoRow.name,
            defaultBranch: repoRow.defaultBranch,
            isPrivate: repoRow.isPrivate,
            htmlUrl: repoRow.htmlUrl,
            status: repoRow.status,
            openPrCount: repoRow.openPrCount,
            lastSyncedAt: repoRow.lastSyncedAt ? repoRow.lastSyncedAt.toISOString() : null,
            lastSyncStatus: repoRow.lastSyncStatus,
            lastSyncError: repoRow.lastSyncError,
          }
        : null,
    };

    const workspaces = await Promise.all(
      workspaceRows.map(async (ws) => {
        let dirPresent = false;
        if (capabilities.workerReachable) {
          dirPresent = await this.worker
            .checkExists(ws.workspacePathKey)
            .then((r) => r.exists)
            .catch(() => false);
        }
        const collabRole = ws.collabSessions[0]?.participants[0]?.role ?? null;
        return this.toDto(
          ws,
          actorUserId,
          projectContext,
          dirPresent,
          capabilities.terminalAvailable,
          collabRole,
        );
      }),
    );

    const tasks: TaskSummaryDto[] = taskRows.map(toTaskSummaryDto);
    const proposals: IdeReviewableProposalDto[] = proposalRuns
      .filter((r) => r.proposals[0])
      .map((r) => ({
        runId: r.id,
        taskId: r.task.id,
        taskIdentifier: r.task.identifier,
        taskTitle: r.task.title,
        proposal: toAgentProposalDto(r.proposals[0]!),
      }));

    return { project: projectDto, capabilities, workspaces, tasks, proposals };
  }

  async createWorkspace(
    actorUserId: string,
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
    body: { name?: unknown; branch?: unknown; taskId?: unknown },
  ): Promise<DevWorkspaceDto> {
    if (!this.canCreateWorkspace(projectContext)) {
      throw new ForbiddenException(
        "Workspace creation requires a Developer, Project Manager, Admin, or Owner role.",
      );
    }
    if (projectContext.project.status !== "ACTIVE") {
      throw new BadRequestException("Cannot create a workspace in an archived project.");
    }

    const cfg = this.worker.getWorkerConfig();
    const capabilities = await this.worker.getRuntimeCapabilities();
    if (!capabilities.workerReachable) {
      throw new ServiceUnavailableException(capabilities.workerReason);
    }
    if (!capabilities.gitAvailable) {
      throw new ServiceUnavailableException("Git binary is not available on the workspace worker.");
    }
    if (!this.githubConfig.getStatus().configured) {
      throw new ServiceUnavailableException(
        "GitHub App credentials are not configured on the API server.",
      );
    }

    const repo = await this.db.prisma.projectRepository.findFirst({
      where: { organizationId: orgId, projectId, status: "CONNECTED" },
      include: { installation: true },
    });
    if (!repo || repo.installation.status !== "ACTIVE") {
      throw new BadRequestException(
        "Connect an active GitHub repository before launching a development workspace.",
      );
    }

    const activeCount = await this.db.prisma.devWorkspace.count({
      where: {
        organizationId: orgId,
        projectId,
        deletedAt: null,
        status: { in: ["CREATING", "READY", "ACTIVE", "SUSPENDED", "STOPPED"] },
      },
    });
    if (activeCount >= cfg.workspaceMaxPerProject) {
      throw new ConflictException(
        `Project workspace limit reached (${cfg.workspaceMaxPerProject}). Delete unused workspaces first.`,
      );
    }

    let taskId: string | null = null;
    if (typeof body?.taskId === "string" && body.taskId.trim()) {
      const taskRow = await this.db.prisma.task.findFirst({
        where: { id: body.taskId.trim(), organizationId: orgId, projectId, archivedAt: null },
        select: { id: true },
      });
      if (!taskRow) throw new NotFoundException("Selected task not found in this project.");
      taskId = taskRow.id;
    }

    const rawName = typeof body?.name === "string" && body.name.trim() ? body.name.trim() : "";
    const workspaceName = rawName
      ? rawName.slice(0, 80)
      : `${repo.name}-${randomBytes(2).toString("hex")}`;
    const targetBranch =
      typeof body?.branch === "string" && body.branch.trim()
        ? body.branch.trim()
        : repo.defaultBranch;

    let baseCommitSha: string;
    let tarballBuffer: Buffer;
    try {
      const branchInfo = await this.githubClient.getBranch(
        repo.installation.githubInstallationId,
        repo.owner,
        repo.name,
        targetBranch,
      );
      if (!branchInfo?.commit?.sha) {
        throw new Error("Branch response missing commit SHA.");
      }
      baseCommitSha = branchInfo.commit.sha;
      tarballBuffer = await this.githubClient.downloadRepositoryTarball(
        repo.installation.githubInstallationId,
        repo.owner,
        repo.name,
        baseCommitSha,
      );
    } catch (err) {
      if (err instanceof GitHubApiError) {
        if (err.status === 403 || err.status === 404) {
          throw new BadRequestException(
            `Unable to fetch "${targetBranch}" from ${repo.fullName}. Verify the branch exists and GitHub App has Contents (Read-only) permission.`,
          );
        }
        throw new ServiceUnavailableException(scrubSecrets(err.message));
      }
      throw new ServiceUnavailableException(
        err instanceof Error ? scrubSecrets(err.message) : "Failed to retrieve repository archive.",
      );
    }

    const pathKey = `ws_${randomBytes(12).toString("hex")}`;
    const expiresAt = new Date(Date.now() + cfg.workspaceTtlHours * 3600_000);
    const storageMode = capabilities.storageMode;
    const storageWarning = storageWarningForMode(storageMode);

    const created = await this.db.prisma.devWorkspace.create({
      data: {
        organizationId: orgId,
        projectId,
        projectRepositoryId: repo.id,
        ownerId: actorUserId,
        taskId,
        name: workspaceName,
        status: "CREATING",
        storageMode,
        storageWarning,
        repoFullName: repo.fullName,
        baseBranch: targetBranch,
        baseCommitSha,
        currentBranch: targetBranch,
        workspacePathKey: pathKey,
        expiresAt,
      },
    });

    try {
      const initRes = await this.worker.initWorkspace({
        pathKey,
        tarballBuffer,
        repoFullName: repo.fullName,
        baseBranch: targetBranch,
        baseCommitSha,
      });

      await this.db.prisma.$transaction(async (tx) => {
        await tx.devWorkspace.update({
          where: { id: created.id },
          data: {
            status: "READY",
            lastCommitSha: initRes.headSha,
            currentBranch: targetBranch,
            lastActiveAt: new Date(),
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: created.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "WORKSPACE_CREATED",
            message: `Initialized workspace "${workspaceName}" from ${repo.fullName}@${baseCommitSha.slice(0, 7)} (${initRes.fileCount} files).`,
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: created.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "REPOSITORY_INITIALIZED",
            message: `Prepared isolated Git workspace on branch ${targetBranch}.`,
          },
        });
        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "WORKSPACE_CREATED",
            summary: `Created browser IDE workspace "${workspaceName}" (${repo.fullName})`,
            metadata: { workspaceId: created.id, baseCommitSha },
          },
        });
      });
    } catch (error) {
      const msg = scrubSecrets(error instanceof Error ? error.message : String(error));
      await this.db.prisma.$transaction(async (tx) => {
        await tx.devWorkspace.update({
          where: { id: created.id },
          data: {
            status: "FAILED",
            errorCode: "INIT_FAILED",
            errorMessage: msg.slice(0, 1000),
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: created.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "WORKSPACE_FAILED",
            message: `Workspace initialization failed: ${msg.slice(0, 300)}`,
          },
        });
      });
      throw error;
    }

    return this.getWorkspaceDetail(actorUserId, orgId, projectId, created.id, projectContext);
  }

  async getWorkspaceDetail(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ): Promise<DevWorkspaceDto> {
    let ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );

    const capabilities = await this.worker.getRuntimeCapabilities();
    let dirPresent = false;
    if (capabilities.workerReachable) {
      dirPresent = await this.worker
        .checkExists(ws.workspacePathKey)
        .then((r) => r.exists)
        .catch(() => false);
    }

    if (ws.status === "READY" && dirPresent) {
      await this.db.prisma.devWorkspace.update({
        where: { id: ws.id },
        data: { status: "ACTIVE", lastActiveAt: new Date() },
      });
      ws = await this.loadWorkspaceAndAuthorize(
        actorUserId,
        orgId,
        projectId,
        workspaceId,
        projectContext,
      );
    }

    return this.toDto(
      ws,
      actorUserId,
      projectContext,
      dirPresent,
      capabilities.terminalAvailable,
      ws.collabRole,
    );
  }

  async transitionLifecycle(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    action: "suspend" | "stop" | "resume",
  ): Promise<DevWorkspaceDto> {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    if (ws.ownerId !== actorUserId && !projectContext.canManage) {
      throw new ForbiddenException("Only the workspace owner or a project manager can suspend, stop, or resume a workspace.");
    }

    const capabilities = await this.worker.getRuntimeCapabilities();

    if (action === "suspend" || action === "stop") {
      if (!["READY", "ACTIVE", ...(action === "stop" ? ["SUSPENDED"] : [])].includes(ws.status)) {
        throw new ConflictException(`Cannot ${action} workspace from ${ws.status} state.`);
      }

      if (capabilities.workerReachable) {
        const exists = await this.worker
          .checkExists(ws.workspacePathKey)
          .then((r) => r.exists)
          .catch(() => false);
        if (exists) {
          const snapshotId = `snap_${randomBytes(8).toString("hex")}`;
          const snapRes = await this.worker.createSnapshot(ws.workspacePathKey, ws.id, snapshotId);
          await this.db.prisma.$transaction(async (tx) => {
            await tx.workspaceSnapshot.create({
              data: {
                id: snapshotId,
                workspaceId: ws.id,
                baseCommitSha: ws.lastCommitSha ?? ws.baseCommitSha ?? "head",
                branchName: ws.currentBranch ?? ws.baseBranch,
                status: "AVAILABLE",
                storageKey: snapRes.storageKey,
                sizeBytes: snapRes.sizeBytes,
                checksumSha256: snapRes.checksumSha256,
                trackedFileCount: snapRes.trackedFileCount,
                untrackedFileCount: snapRes.untrackedFileCount,
                createdById: actorUserId,
              },
            });
            await tx.workspaceEvent.create({
              data: {
                workspaceId: ws.id,
                organizationId: orgId,
                projectId,
                actorId: actorUserId,
                eventType: "SNAPSHOT_CREATED",
                message: `Captured recovery snapshot (${snapRes.trackedFileCount} tracked, ${snapRes.untrackedFileCount} untracked files).`,
              },
            });
          });
        }
      }

      const now = new Date();
      await this.db.prisma.$transaction(async (tx) => {
        await tx.devWorkspace.update({
          where: { id: ws.id },
          data: {
            status: action === "suspend" ? "SUSPENDED" : "STOPPED",
            ...(action === "suspend" ? { suspendedAt: now } : { stoppedAt: now }),
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: ws.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: action === "suspend" ? "WORKSPACE_SUSPENDED" : "WORKSPACE_STOPPED",
            message: `Workspace ${action === "suspend" ? "suspended" : "stopped"} cleanly.`,
          },
        });
        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: action === "suspend" ? "WORKSPACE_SUSPENDED" : "WORKSPACE_STOPPED",
            summary: `${action === "suspend" ? "Suspended" : "Stopped"} workspace "${ws.name}"`,
            metadata: { workspaceId: ws.id },
          },
        });
      });

      return this.getWorkspaceDetail(actorUserId, orgId, projectId, workspaceId, projectContext);
    }

    // Resume / Restore
    if (!["SUSPENDED", "STOPPED", "FAILED", "READY", "ACTIVE"].includes(ws.status)) {
      throw new ConflictException(`Cannot resume workspace from ${ws.status} state.`);
    }
    if (!capabilities.workerReachable) {
      throw new ServiceUnavailableException(capabilities.workerReason);
    }

    const exists = await this.worker.checkExists(ws.workspacePathKey).then((r) => r.exists);
    if (!exists) {
      // Reconstruct from GitHub baseCommitSha + latest AVAILABLE snapshot
      const latestSnapshot = ws.snapshots.find((s) => s.status === "AVAILABLE") ?? null;
      if (!latestSnapshot || !ws.projectRepositoryId) {
        await this.db.prisma.devWorkspace.update({
          where: { id: ws.id },
          data: {
            status: "FAILED",
            errorCode: "RECOVERY_UNAVAILABLE",
            errorMessage:
              "Workspace directory is missing on worker and no recovery snapshot is available.",
          },
        });
        throw new ConflictException(
          "Workspace files are no longer on worker storage and no recoverable snapshot exists.",
        );
      }

      const repo = await this.db.prisma.projectRepository.findFirst({
        where: { id: ws.projectRepositoryId, organizationId: orgId, projectId, status: "CONNECTED" },
        include: { installation: true },
      });
      if (!repo || repo.installation.status !== "ACTIVE" || !ws.baseCommitSha) {
        throw new ConflictException(
          "Cannot reconstruct workspace because connected GitHub repository or baseline commit is unavailable.",
        );
      }

      const tarballBuffer = await this.githubClient.downloadRepositoryTarball(
        repo.installation.githubInstallationId,
        repo.owner,
        repo.name,
        ws.baseCommitSha,
      );
      await this.worker.initWorkspace({
        pathKey: ws.workspacePathKey,
        tarballBuffer,
        repoFullName: repo.fullName,
        baseBranch: ws.baseBranch,
        baseCommitSha: ws.baseCommitSha,
      });

      const restoreRes = await this.worker.restoreSnapshot(
        ws.workspacePathKey,
        latestSnapshot.storageKey,
        latestSnapshot.checksumSha256,
      );

      await this.db.prisma.$transaction(async (tx) => {
        await tx.workspaceSnapshot.update({
          where: { id: latestSnapshot.id },
          data: { status: "RESTORED", restoredAt: new Date() },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: ws.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "SNAPSHOT_RESTORED",
            message: `Reconstructed workspace and restored ${restoreRes.restoredFiles} file(s) from recovery snapshot.`,
          },
        });
      });
    }

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: {
          status: "ACTIVE",
          lastActiveAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "WORKSPACE_RESUMED",
          message: `Resumed workspace "${ws.name}".`,
        },
      });
    });

    return this.getWorkspaceDetail(actorUserId, orgId, projectId, workspaceId, projectContext);
  }

  async createSnapshot(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ): Promise<WorkspaceSnapshotDto> {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const snapshotId = `snap_${randomBytes(8).toString("hex")}`;
    const snapRes = await this.worker.createSnapshot(ws.workspacePathKey, ws.id, snapshotId);

    const created = await this.db.prisma.$transaction(async (tx) => {
      const row = await tx.workspaceSnapshot.create({
        data: {
          id: snapshotId,
          workspaceId: ws.id,
          baseCommitSha: ws.lastCommitSha ?? ws.baseCommitSha ?? "head",
          branchName: ws.currentBranch ?? ws.baseBranch,
          status: "AVAILABLE",
          storageKey: snapRes.storageKey,
          sizeBytes: snapRes.sizeBytes,
          checksumSha256: snapRes.checksumSha256,
          trackedFileCount: snapRes.trackedFileCount,
          untrackedFileCount: snapRes.untrackedFileCount,
          createdById: actorUserId,
        },
        include: { createdBy: { select: USER_SELECT } },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "SNAPSHOT_CREATED",
          message: `Created manual checkpoint (${snapRes.trackedFileCount} modified, ${snapRes.untrackedFileCount} untracked files).`,
        },
      });
      return row;
    });

    return toWorkspaceSnapshotDto(created);
  }

  async deleteWorkspace(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ): Promise<{ deleted: true }> {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );

    const capabilities = await this.worker.getRuntimeCapabilities();
    if (capabilities.workerReachable) {
      await this.worker.deleteWorkspace(ws.workspacePathKey).catch(() => {});
    }

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: { status: "EXPIRED", deletedAt: new Date() },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "WORKSPACE_DELETED",
          message: `Deleted workspace "${ws.name}".`,
        },
      });
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "WORKSPACE_DELETED",
          summary: `Deleted browser IDE workspace "${ws.name}"`,
          metadata: { workspaceId: ws.id },
        },
      });
    });

    return { deleted: true };
  }

  async listTree(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    return this.worker.listTree(ws.workspacePathKey);
  }

  async readFile(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    relPath: string,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    return this.worker.readFile(ws.workspacePathKey, relPath);
  }

  async writeFile(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    body: { path?: unknown; content?: unknown; expectedVersionHash?: unknown },
  ) {
    if (typeof body?.path !== "string" || !body.path.trim()) {
      throw new BadRequestException("File path is required.");
    }
    if (typeof body?.content !== "string") {
      throw new BadRequestException("File content must be text.");
    }
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const saved = await this.worker.writeFile(ws.workspacePathKey, {
      path: body.path.trim(),
      content: body.content,
      expectedVersionHash:
        typeof body.expectedVersionHash === "string" ? body.expectedVersionHash : null,
    });

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: { lastActiveAt: new Date() },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "FILE_SAVED",
          message: `Saved ${saved.path} (${saved.size} bytes).`,
        },
      });
    });

    return saved;
  }

  async createEntry(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    body: { type?: unknown; path?: unknown; content?: unknown },
  ) {
    if (typeof body?.path !== "string" || !body.path.trim()) {
      throw new BadRequestException("Path is required.");
    }
    const kind = body?.type === "directory" ? "directory" : "file";
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );

    if (kind === "directory") {
      const folder = await this.worker.createFolder(ws.workspacePathKey, {
        path: body.path.trim(),
      });
      await this.db.prisma.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "FILE_CREATED",
          message: `Created folder ${folder.path}.`,
        },
      });
      return { type: "directory", ...folder };
    }

    const file = await this.worker.createFile(ws.workspacePathKey, {
      path: body.path.trim(),
      content: typeof body.content === "string" ? body.content : "",
    });
    await this.db.prisma.workspaceEvent.create({
      data: {
        workspaceId: ws.id,
        organizationId: orgId,
        projectId,
        actorId: actorUserId,
        eventType: "FILE_CREATED",
        message: `Created file ${file.path}.`,
      },
    });
    return { type: "file", ...file };
  }

  async renameEntry(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    body: { oldPath?: unknown; newPath?: unknown },
  ) {
    if (typeof body?.oldPath !== "string" || typeof body?.newPath !== "string") {
      throw new BadRequestException("Both oldPath and newPath are required.");
    }
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const moved = await this.worker.renameEntry(ws.workspacePathKey, {
      oldPath: body.oldPath,
      newPath: body.newPath,
    });
    await this.db.prisma.workspaceEvent.create({
      data: {
        workspaceId: ws.id,
        organizationId: orgId,
        projectId,
        actorId: actorUserId,
        eventType: "FILE_RENAMED",
        message: `Renamed ${moved.oldPath} -> ${moved.newPath}.`,
      },
    });
    return moved;
  }

  async deleteEntry(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    body: { path?: unknown; confirmNonEmpty?: unknown },
  ) {
    if (typeof body?.path !== "string" || !body.path.trim()) {
      throw new BadRequestException("Target path is required.");
    }
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const removed = await this.worker.deleteEntry(ws.workspacePathKey, {
      path: body.path.trim(),
      confirmNonEmpty: body.confirmNonEmpty === true,
    });
    await this.db.prisma.workspaceEvent.create({
      data: {
        workspaceId: ws.id,
        organizationId: orgId,
        projectId,
        actorId: actorUserId,
        eventType: "FILE_DELETED",
        message: `Deleted ${removed.deletedDirectory ? "folder" : "file"} ${removed.path}.`,
      },
    });
    return removed;
  }

  async searchFiles(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    query: string,
    mode: "files" | "text",
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    return this.worker.search(ws.workspacePathKey, query, mode);
  }

  async getGitStatus(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    const status = await this.worker.getGitStatus(ws.workspacePathKey);
    await this.db.prisma.devWorkspace.update({
      where: { id: ws.id },
      data: {
        currentBranch: status.branch,
        lastCommitSha: status.headSha,
        dirtyFileCount: status.files.length,
        lastActiveAt: new Date(),
      },
    });
    return status;
  }

  async getGitDiff(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    scope: "unstaged" | "staged" | "commit",
    path?: string,
    sha?: string,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
    );
    return this.worker.getGitDiff(ws.workspacePathKey, scope, path, sha);
  }

  async stageFiles(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    paths?: string[],
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const status = await this.worker.stageFiles(ws.workspacePathKey, paths);
    await this.db.prisma.devWorkspace.update({
      where: { id: ws.id },
      data: { dirtyFileCount: status.files.length, lastActiveAt: new Date() },
    });
    return status;
  }

  async unstageFiles(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    paths?: string[],
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const status = await this.worker.unstageFiles(ws.workspacePathKey, paths);
    await this.db.prisma.devWorkspace.update({
      where: { id: ws.id },
      data: { dirtyFileCount: status.files.length, lastActiveAt: new Date() },
    });
    return status;
  }

  async commitLocal(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    message: string,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const committed = await this.worker.commitChanges(ws.workspacePathKey, message);

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: {
          lastCommitSha: committed.sha,
          dirtyFileCount: committed.status.files.length,
          lastActiveAt: new Date(),
        },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "GIT_COMMIT_CREATED",
          message: `Created local commit ${committed.shortSha}: ${committed.message}`,
        },
      });
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "WORKSPACE_LOCAL_COMMIT",
          summary: `Created local Git commit ${committed.shortSha} in workspace "${ws.name}"`,
          metadata: { workspaceId: ws.id, commitSha: committed.sha },
        },
      });
    });

    return committed;
  }

  async switchBranch(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    branch: string,
    createNew: boolean,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );
    const status = await this.worker.switchBranch(ws.workspacePathKey, branch, createNew);

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: {
          currentBranch: status.branch,
          lastCommitSha: status.headSha,
          lastActiveAt: new Date(),
        },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "GIT_BRANCH_SWITCHED",
          message: `${createNew ? "Created and checked out" : "Checked out"} local branch ${status.branch}.`,
        },
      });
    });

    return status;
  }

  async applyAiProposal(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    proposalId: string,
  ) {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );

    const proposal = await this.db.prisma.agentProposal.findFirst({
      where: {
        id: proposalId,
        run: { organizationId: orgId, projectId },
      },
      include: {
        run: {
          select: {
            id: true,
            taskId: true,
            repoFullName: true,
            baseCommitSha: true,
            task: { select: { identifier: true } },
          },
        },
      },
    });

    if (!proposal) {
      throw new NotFoundException("AI proposal not found in this project.");
    }
    if (proposal.run.repoFullName !== ws.repoFullName) {
      throw new ConflictException(
        `AI proposal targets repository ${proposal.run.repoFullName}, which does not match workspace ${ws.repoFullName}.`,
      );
    }
    if (
      proposal.baseCommitSha &&
      ws.baseCommitSha &&
      proposal.baseCommitSha !== ws.baseCommitSha
    ) {
      throw new ConflictException(
        `Stale AI proposal: generated against ${proposal.baseCommitSha.slice(0, 7)}, while workspace baseline is ${ws.baseCommitSha.slice(0, 7)}.`,
      );
    }

    const applied = await this.worker.applyPatch(ws.workspacePathKey, proposal.rawPatch);

    await this.db.prisma.$transaction(async (tx) => {
      await tx.devWorkspace.update({
        where: { id: ws.id },
        data: { dirtyFileCount: applied.status.files.length, lastActiveAt: new Date() },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "AI_PATCH_APPLIED",
          message: `Applied AI proposal v${proposal.version} (${applied.filesChanged} files changed locally in workspace).`,
        },
      });
      await tx.taskActivity.create({
        data: {
          taskId: proposal.run.taskId,
          projectId,
          actorId: actorUserId,
          eventType: "WORKSPACE_AI_PATCH_APPLIED",
          field: "workspace",
          newValue: ws.id,
          summary: `Applied AI proposal v${proposal.version} locally into workspace "${ws.name}"`,
        },
      });
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "WORKSPACE_AI_PATCH_APPLIED",
          summary: `Applied AI proposal v${proposal.version} (${proposal.run.task.identifier}) into workspace "${ws.name}"`,
          metadata: { workspaceId: ws.id, proposalId: proposal.id },
        },
      });
    });

    return applied;
  }

  async createTerminalSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
  ): Promise<WorkspaceTerminalTicketDto> {
    const ws = await this.loadWorkspaceAndAuthorize(
      actorUserId,
      orgId,
      projectId,
      workspaceId,
      projectContext,
      true,
    );

    if (ws.ownerId !== actorUserId) {
      throw new ForbiddenException(
        "Interactive terminal sessions are strictly restricted to the workspace owner.",
      );
    }

    const capabilities = await this.worker.getRuntimeCapabilities();
    if (!capabilities.workerReachable || !capabilities.terminalAvailable) {
      const reason = !capabilities.workerReachable
        ? capabilities.workerReason
        : capabilities.terminalReason;

      await this.db.prisma.$transaction(async (tx) => {
        await tx.workspaceTerminalSession.create({
          data: {
            workspaceId: ws.id,
            organizationId: orgId,
            projectId,
            userId: actorUserId,
            status: "REJECTED",
            sandboxed: false,
            reason: reason.slice(0, 500),
            endedAt: new Date(),
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: ws.id,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "TERMINAL_REJECTED",
            message: `Terminal rejected: ${reason.slice(0, 300)}`,
          },
        });
      });

      throw new ServiceUnavailableException(reason);
    }

    const sessionId = `term_${randomUUID()}`;
    const ticket = await this.worker.signTerminalTicket({
      userId: actorUserId,
      orgId,
      projectId,
      workspaceId: ws.id,
      workspacePathKey: ws.workspacePathKey,
      sessionId,
    });

    await this.db.prisma.$transaction(async (tx) => {
      await tx.workspaceTerminalSession.create({
        data: {
          id: sessionId,
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          userId: actorUserId,
          status: "ACTIVE",
          sandboxed: true,
        },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "TERMINAL_SESSION_STARTED",
          message: "Opened sandboxed workspace terminal ticket.",
        },
      });
    });

    return {
      sessionId,
      wsUrl: ticket.wsUrl,
      token: ticket.token,
      expiresAt: ticket.expiresAt,
      sandboxed: true,
      explanation: capabilities.terminalReason,
    };
  }
}
