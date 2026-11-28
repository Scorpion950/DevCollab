import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CollabDocumentDto,
  CollabMessageDto,
  CollabParticipantDto,
  CollabRole,
  CollabSessionDetailDto,
  CollabSessionSummaryDto,
  CollabWsTicketDto,
  TaskUserRef,
} from "@devcollab/shared";
import type { ProjectContext } from "../authorization/authorization.constants";
import { DatabaseService } from "../database/database.service";
import { WorkerClientService } from "../workspaces/worker-client.service";

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

const PARTICIPANT_PALETTE = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
];

function pickParticipantColor(index: number): string {
  return PARTICIPANT_PALETTE[Math.abs(index) % PARTICIPANT_PALETTE.length] ?? "#3b82f6";
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

function sanitizeOptionalText(value: unknown, maxLen: number, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new BadRequestException(`${label} must be a string.`);
  }
  const cleaned = stripDisallowedControlChars(value).trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLen) {
    throw new BadRequestException(`${label} exceeds maximum length of ${maxLen} characters.`);
  }
  return cleaned;
}

@Injectable()
export class CollabService {
  constructor(
    private readonly db: DatabaseService,
    private readonly worker: WorkerClientService,
  ) {}

  private canParticipateInCollab(projectContext: ProjectContext): boolean {
    return projectContext.canManage || projectContext.projectRole === "DEVELOPER";
  }

  private toParticipantDto(p: {
    id: string;
    sessionId: string;
    userId: string;
    user: TaskUserRef;
    role: CollabRole;
    status: "ACTIVE" | "LEFT" | "REMOVED";
    colorHex: string;
    joinedAt: Date;
    leftAt: Date | null;
    revokedAt: Date | null;
    revokedReason: string | null;
    lastSeenAt: Date;
  }): CollabParticipantDto {
    return {
      id: p.id,
      sessionId: p.sessionId,
      userId: p.userId,
      user: p.user,
      role: p.role,
      status: p.status,
      colorHex: p.colorHex,
      joinedAt: p.joinedAt.toISOString(),
      leftAt: p.leftAt ? p.leftAt.toISOString() : null,
      revokedAt: p.revokedAt ? p.revokedAt.toISOString() : null,
      revokedReason: p.revokedReason,
      lastSeenAt: p.lastSeenAt.toISOString(),
    };
  }

  private toDocumentDto(d: {
    id: string;
    sessionId: string;
    filePath: string;
    docKey: string;
    versionSeq: number;
    contentSha256: string;
    lastModifiedById: string | null;
    deletedAt: Date | null;
    lastSavedAt: Date;
  }): CollabDocumentDto {
    return {
      id: d.id,
      sessionId: d.sessionId,
      filePath: d.filePath,
      docKey: d.docKey,
      versionSeq: d.versionSeq,
      contentSha256: d.contentSha256,
      lastModifiedById: d.lastModifiedById,
      deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
      lastSavedAt: d.lastSavedAt.toISOString(),
    };
  }

  private toMessageDto(m: {
    id: string;
    sessionId: string;
    author: TaskUserRef | null;
    body: string;
    filePath: string | null;
    lineNumber: number | null;
    createdAt: Date;
  }): CollabMessageDto {
    return {
      id: m.id,
      sessionId: m.sessionId,
      author: m.author,
      body: m.body,
      filePath: m.filePath,
      lineNumber: m.lineNumber,
      createdAt: m.createdAt.toISOString(),
    };
  }

  async listProjectSessions(
    actorUserId: string,
    orgId: string,
    projectId: string,
    projectContext: ProjectContext,
  ): Promise<CollabSessionSummaryDto[]> {
    if (!this.canParticipateInCollab(projectContext)) {
      throw new ForbiddenException(
        "Collaborative coding sessions are restricted to authorized project developers and managers.",
      );
    }

    const sessions = await this.db.prisma.collabSession.findMany({
      where: {
        organizationId: orgId,
        projectId,
        OR: [
          { createdById: actorUserId },
          {
            participants: {
              some: {
                userId: actorUserId,
                status: { in: ["ACTIVE", "LEFT"] },
              },
            },
          },
        ],
      },
      orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
      take: 25,
      include: {
        workspace: { select: { id: true, name: true, status: true } },
        task: { select: { id: true, identifier: true } },
        createdBy: { select: USER_SELECT },
        participants: {
          where: { status: "ACTIVE" },
          select: { userId: true, role: true, status: true },
        },
        _count: {
          select: { participants: { where: { status: "ACTIVE" } } },
        },
      },
    });

    const allMyRows = await this.db.prisma.collabParticipant.findMany({
      where: {
        userId: actorUserId,
        sessionId: { in: sessions.map((s) => s.id) },
      },
      select: { sessionId: true, role: true, status: true },
    });
    const myBySession = new Map(allMyRows.map((row) => [row.sessionId, row]));

    return sessions.map((s) => {
      const mine = myBySession.get(s.id) ?? null;
      return {
        id: s.id,
        organizationId: s.organizationId,
        projectId: s.projectId,
        workspaceId: s.workspaceId,
        workspaceName: s.workspace.name,
        taskId: s.taskId,
        taskIdentifier: s.task?.identifier ?? null,
        title: s.title,
        status: s.status,
        activeFilePath: s.activeFilePath,
        participantCount: s._count.participants,
        myRole: mine?.role ?? null,
        myStatus: mine?.status ?? null,
        createdBy: s.createdBy,
        lastActivityAt: s.lastActivityAt.toISOString(),
        closedAt: s.closedAt ? s.closedAt.toISOString() : null,
        createdAt: s.createdAt.toISOString(),
      };
    });
  }

  private async resolveEligibleProjectMembers(
    orgId: string,
    projectId: string,
  ): Promise<TaskUserRef[]> {
    const [orgAdmins, projectDevs] = await Promise.all([
      this.db.prisma.organizationMembership.findMany({
        where: {
          organizationId: orgId,
          status: "ACTIVE",
          role: { in: ["OWNER", "ADMIN"] },
        },
        select: { user: { select: USER_SELECT } },
      }),
      this.db.prisma.projectRoleAssignment.findMany({
        where: {
          projectId,
          role: { in: ["PROJECT_MANAGER", "DEVELOPER"] },
          user: {
            memberships: {
              some: {
                organizationId: orgId,
                status: "ACTIVE",
              },
            },
          },
        },
        select: { user: { select: USER_SELECT } },
      }),
    ]);

    const byId = new Map<string, TaskUserRef>();
    for (const row of [...orgAdmins, ...projectDevs]) {
      byId.set(row.user.id, row.user);
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.name ?? a.email).localeCompare(b.name ?? b.email),
    );
  }

  async createSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    workspaceId: string,
    projectContext: ProjectContext,
    body: { title?: unknown; activeFilePath?: unknown; inviteeIds?: unknown },
  ): Promise<CollabSessionDetailDto> {
    if (!this.canParticipateInCollab(projectContext)) {
      throw new ForbiddenException("Only authorized project developers or managers can start collaboration.");
    }
    if (projectContext.project.status !== "ACTIVE") {
      throw new ForbiddenException("Cannot start collaborative coding in an archived project.");
    }

    const ws = await this.db.prisma.devWorkspace.findFirst({
      where: { id: workspaceId, organizationId: orgId, projectId, deletedAt: null },
      include: { owner: { select: USER_SELECT } },
    });
    if (!ws) {
      throw new NotFoundException("Workspace not found in this project.");
    }
    if (ws.ownerId !== actorUserId && !projectContext.canManage) {
      throw new ForbiddenException("Only the workspace owner or a project manager can share this workspace.");
    }
    if (ws.status !== "READY" && ws.status !== "ACTIVE") {
      throw new ConflictException(`Workspace is ${ws.status}; resume it before starting collaboration.`);
    }

    const existingActive = await this.db.prisma.collabSession.findFirst({
      where: { workspaceId: ws.id, organizationId: orgId, projectId, status: "ACTIVE" },
      select: { id: true },
    });

    if (existingActive) {
      // Ensure starter/owner has active participant row and return active session cleanly
      const existingParticipant = await this.db.prisma.collabParticipant.findUnique({
        where: { sessionId_userId: { sessionId: existingActive.id, userId: actorUserId } },
      });
      if (!existingParticipant) {
        await this.db.prisma.collabParticipant.create({
          data: {
            sessionId: existingActive.id,
            userId: actorUserId,
            role: ws.ownerId === actorUserId ? "OWNER" : "EDITOR",
            status: "ACTIVE",
            colorHex: pickParticipantColor(0),
          },
        });
      } else if (existingParticipant.status === "LEFT") {
        await this.db.prisma.collabParticipant.update({
          where: { id: existingParticipant.id },
          data: { status: "ACTIVE", leftAt: null, lastSeenAt: new Date() },
        });
      }
      return this.getSessionDetail(actorUserId, orgId, projectId, existingActive.id, projectContext);
    }

    const title =
      sanitizeOptionalText(body.title, 120, "Session title") ??
      `Live Session · ${ws.name}`;
    const activeFilePath = sanitizeOptionalText(body.activeFilePath, 300, "Active file path");

    const eligible = await this.resolveEligibleProjectMembers(orgId, projectId);
    const eligibleSet = new Set(eligible.map((u) => u.id));

    const requestedInvitees = Array.isArray(body.inviteeIds)
      ? Array.from(
          new Set(
            body.inviteeIds.filter((v): v is string => typeof v === "string" && v.trim().length > 0),
          ),
        ).slice(0, 12)
      : [];

    for (const invId of requestedInvitees) {
      if (!eligibleSet.has(invId)) {
        throw new ForbiddenException(
          "Cannot invite user without active project developer or manager permissions.",
        );
      }
    }

    const created = await this.db.prisma.$transaction(async (tx) => {
      const session = await tx.collabSession.create({
        data: {
          organizationId: orgId,
          projectId,
          workspaceId: ws.id,
          taskId: ws.taskId,
          createdById: actorUserId,
          title,
          status: "ACTIVE",
          activeFilePath,
        },
      });

      const participantRows = [
        {
          sessionId: session.id,
          userId: actorUserId,
          invitedById: actorUserId,
          role: "OWNER" as const,
          status: "ACTIVE" as const,
          colorHex: pickParticipantColor(0),
        },
        ...requestedInvitees
          .filter((id) => id !== actorUserId)
          .map((userId, idx) => ({
            sessionId: session.id,
            userId,
            invitedById: actorUserId,
            role: "EDITOR" as const,
            status: "ACTIVE" as const,
            colorHex: pickParticipantColor(idx + 1),
          })),
      ];

      await tx.collabParticipant.createMany({ data: participantRows });

      await tx.workspaceEvent.create({
        data: {
          workspaceId: ws.id,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "COLLAB_SESSION_STARTED",
          message: `Collaborative coding session "${title}" started.`,
          metadata: { sessionId: session.id, inviteCount: requestedInvitees.length },
        },
      });

      if (ws.taskId) {
        await tx.taskActivity.create({
          data: {
            taskId: ws.taskId,
            projectId,
            actorId: actorUserId,
            eventType: "COLLAB_SESSION_STARTED",
            summary: `Started collaborative coding session "${title}".`,
          },
        });
      }

      return session;
    });

    return this.getSessionDetail(actorUserId, orgId, projectId, created.id, projectContext);
  }

  private async loadAuthorizedSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
    opts?: { requireActiveParticipant?: boolean; requireOwner?: boolean; allowClosed?: boolean },
  ) {
    if (!this.canParticipateInCollab(projectContext)) {
      throw new ForbiddenException("Project developer or manager permissions required for collaboration.");
    }

    const session = await this.db.prisma.collabSession.findFirst({
      where: { id: sessionId, organizationId: orgId, projectId },
      include: {
        workspace: { select: { id: true, name: true, workspacePathKey: true, status: true, taskId: true } },
        task: { select: { id: true, identifier: true } },
        createdBy: { select: USER_SELECT },
        participants: {
          orderBy: [{ joinedAt: "asc" }],
          include: { user: { select: USER_SELECT } },
        },
        documents: {
          where: { deletedAt: null },
          orderBy: [{ lastSavedAt: "desc" }],
          take: 50,
        },
        messages: {
          orderBy: [{ createdAt: "asc" }],
          take: 100,
          include: { author: { select: USER_SELECT } },
        },
      },
    });

    if (!session) {
      throw new NotFoundException("Collaborative session not found in this project.");
    }

    const myParticipant = session.participants.find((p) => p.userId === actorUserId) ?? null;

    if (myParticipant?.status === "REMOVED") {
      throw new ForbiddenException("PERMISSION_REVOKED: Your access to this collaborative session was revoked.");
    }

    if (!myParticipant) {
      throw new ForbiddenException("This collaborative session is private and you have not been invited.");
    }

    if (!opts?.allowClosed && session.status !== "ACTIVE") {
      throw new ConflictException("SESSION_CLOSED: This collaborative session has already been closed.");
    }

    if (opts?.requireActiveParticipant && myParticipant.status !== "ACTIVE") {
      throw new ForbiddenException("Rejoin the collaborative session before connecting.");
    }

    if (opts?.requireOwner && myParticipant.role !== "OWNER" && !projectContext.canManage) {
      throw new ForbiddenException("Only the session owner or a project manager can manage participants.");
    }

    return { session, myParticipant };
  }

  async getSessionDetail(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
  ): Promise<CollabSessionDetailDto> {
    const { session, myParticipant } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { allowClosed: true },
    );

    const eligibleInvitees = await this.resolveEligibleProjectMembers(orgId, projectId);
    const activeCount = session.participants.filter((p) => p.status === "ACTIVE").length;

    return {
      id: session.id,
      organizationId: session.organizationId,
      projectId: session.projectId,
      workspaceId: session.workspaceId,
      workspaceName: session.workspace.name,
      taskId: session.taskId,
      taskIdentifier: session.task?.identifier ?? null,
      title: session.title,
      status: session.status,
      activeFilePath: session.activeFilePath,
      participantCount: activeCount,
      myRole: myParticipant.role,
      myStatus: myParticipant.status,
      createdBy: session.createdBy,
      lastActivityAt: session.lastActivityAt.toISOString(),
      closedAt: session.closedAt ? session.closedAt.toISOString() : null,
      createdAt: session.createdAt.toISOString(),
      participants: session.participants.map((p) => this.toParticipantDto(p)),
      documents: session.documents.map((d) => this.toDocumentDto(d)),
      messages: session.messages.map((m) => this.toMessageDto(m)),
      eligibleInvitees,
    };
  }

  async joinSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
  ): Promise<CollabSessionDetailDto> {
    const { session, myParticipant } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
    );

    if (myParticipant.status !== "ACTIVE") {
      await this.db.prisma.$transaction(async (tx) => {
        await tx.collabParticipant.update({
          where: { id: myParticipant.id },
          data: { status: "ACTIVE", leftAt: null, lastSeenAt: new Date() },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: session.workspaceId,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "COLLAB_PARTICIPANT_JOINED",
            message: `Joined collaborative session "${session.title}".`,
          },
        });
      });
    } else {
      await this.db.prisma.collabParticipant.update({
        where: { id: myParticipant.id },
        data: { lastSeenAt: new Date() },
      });
    }

    return this.getSessionDetail(actorUserId, orgId, projectId, sessionId, projectContext);
  }

  async inviteParticipant(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
    body: { userId?: unknown; role?: unknown },
  ): Promise<CollabSessionDetailDto> {
    const { session } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireActiveParticipant: true, requireOwner: true },
    );

    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    if (!targetUserId) {
      throw new BadRequestException("Invitee userId is required.");
    }
    const role: CollabRole = body.role === "VIEWER" ? "VIEWER" : "EDITOR";

    const eligible = await this.resolveEligibleProjectMembers(orgId, projectId);
    if (!eligible.some((u) => u.id === targetUserId)) {
      throw new ForbiddenException(
        "Target user must be an active project developer, project manager, admin, or owner.",
      );
    }

    const existing = session.participants.find((p) => p.userId === targetUserId);
    if (existing) {
      await this.db.prisma.collabParticipant.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          role: existing.role === "OWNER" ? "OWNER" : role,
          leftAt: null,
          revokedAt: null,
          revokedReason: null,
          invitedById: actorUserId,
          lastSeenAt: new Date(),
        },
      });
      if (existing.role !== "OWNER") {
        await this.worker
          .updateCollabParticipantRole(sessionId, targetUserId, role)
          .catch(() => undefined);
      }
    } else {
      await this.db.prisma.collabParticipant.create({
        data: {
          sessionId,
          userId: targetUserId,
          invitedById: actorUserId,
          role,
          status: "ACTIVE",
          colorHex: pickParticipantColor(session.participants.length),
        },
      });
    }

    await this.db.prisma.workspaceEvent.create({
      data: {
        workspaceId: session.workspaceId,
        organizationId: orgId,
        projectId,
        actorId: actorUserId,
        eventType: "COLLAB_PARTICIPANT_JOINED",
        message: `Invited teammate (${role}) to collaborative session.`,
        metadata: { sessionId, targetUserId, role },
      },
    });

    return this.getSessionDetail(actorUserId, orgId, projectId, sessionId, projectContext);
  }

  async updateParticipantRole(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    targetUserId: string,
    projectContext: ProjectContext,
    body: { role?: unknown },
  ): Promise<CollabSessionDetailDto> {
    const { session } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireActiveParticipant: true, requireOwner: true },
    );

    const role = body.role === "EDITOR" || body.role === "VIEWER" ? body.role : null;
    if (!role) {
      throw new BadRequestException("Participant role must be EDITOR or VIEWER.");
    }

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (!target || target.status === "REMOVED") {
      throw new NotFoundException("Active session participant not found.");
    }
    if (target.role === "OWNER") {
      throw new BadRequestException("Session owner role cannot be downgraded.");
    }

    await this.db.prisma.collabParticipant.update({
      where: { id: target.id },
      data: { role },
    });

    await this.worker
      .updateCollabParticipantRole(sessionId, targetUserId, role)
      .catch(() => undefined);

    return this.getSessionDetail(actorUserId, orgId, projectId, sessionId, projectContext);
  }

  async revokeParticipant(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    targetUserId: string,
    projectContext: ProjectContext,
    reason = "Removed by session owner.",
  ): Promise<CollabSessionDetailDto> {
    const { session } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireActiveParticipant: true, requireOwner: true },
    );

    const target = session.participants.find((p) => p.userId === targetUserId);
    if (!target) {
      throw new NotFoundException("Participant not found in this session.");
    }
    if (target.role === "OWNER" && target.userId === session.createdById) {
      throw new BadRequestException("Cannot remove the primary session owner; close the session instead.");
    }

    const safeReason = sanitizeOptionalText(reason, 200, "Reason") ?? "Removed by session owner.";
    await this.db.prisma.$transaction(async (tx) => {
      await tx.collabParticipant.update({
        where: { id: target.id },
        data: {
          status: "REMOVED",
          revokedAt: new Date(),
          revokedReason: safeReason,
        },
      });
      await tx.workspaceEvent.create({
        data: {
          workspaceId: session.workspaceId,
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          eventType: "COLLAB_PARTICIPANT_REVOKED",
          message: `Revoked session access for participant (${targetUserId}).`,
          metadata: { sessionId, targetUserId, reason: safeReason },
        },
      });
    });

    await this.worker
      .revokeCollabParticipant(sessionId, targetUserId, safeReason)
      .catch(() => undefined);

    return this.getSessionDetail(actorUserId, orgId, projectId, sessionId, projectContext);
  }

  async leaveSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
  ): Promise<{ left: true }> {
    const { myParticipant } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { allowClosed: true },
    );

    if (myParticipant.status === "ACTIVE") {
      await this.db.prisma.collabParticipant.update({
        where: { id: myParticipant.id },
        data: { status: "LEFT", leftAt: new Date() },
      });
    }
    await this.worker
      .revokeCollabParticipant(sessionId, actorUserId, "You left the collaborative session.")
      .catch(() => undefined);
    return { left: true };
  }

  async closeSession(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
  ): Promise<CollabSessionDetailDto> {
    const { session } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireOwner: true, allowClosed: true },
    );

    if (session.status !== "CLOSED") {
      await this.worker.flushCollabSession(session.id, session.workspace.workspacePathKey).catch(() => undefined);
      await this.worker.closeCollabSession(session.id, "Collaborative session closed by owner.").catch(() => undefined);

      await this.db.prisma.$transaction(async (tx) => {
        await tx.collabSession.update({
          where: { id: session.id },
          data: {
            status: "CLOSED",
            closedAt: new Date(),
            closedById: actorUserId,
          },
        });
        await tx.workspaceEvent.create({
          data: {
            workspaceId: session.workspaceId,
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            eventType: "COLLAB_SESSION_CLOSED",
            message: `Closed collaborative session "${session.title}".`,
            metadata: { sessionId: session.id },
          },
        });
        if (session.taskId) {
          await tx.taskActivity.create({
            data: {
              taskId: session.taskId,
              projectId,
              actorId: actorUserId,
              eventType: "COLLAB_SESSION_CLOSED",
              summary: `Closed collaborative coding session "${session.title}".`,
            },
          });
        }
      });
    }

    return this.getSessionDetail(actorUserId, orgId, projectId, sessionId, projectContext);
  }

  async issueWsTicket(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
  ): Promise<CollabWsTicketDto> {
    const { session, myParticipant } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireActiveParticipant: true },
    );

    await this.db.prisma.collabParticipant.update({
      where: { id: myParticipant.id },
      data: { lastSeenAt: new Date() },
    });

    const signed = await this.worker.signCollabTicket({
      userId: actorUserId,
      orgId,
      projectId,
      sessionId: session.id,
      workspaceId: session.workspaceId,
      workspacePathKey: session.workspace.workspacePathKey,
      role: myParticipant.role,
      colorHex: myParticipant.colorHex,
      displayName: myParticipant.user.name?.trim() || myParticipant.user.email,
    });

    return {
      sessionId: session.id,
      workspaceId: session.workspaceId,
      role: myParticipant.role,
      colorHex: myParticipant.colorHex,
      wsUrl: signed.wsUrl,
      token: signed.token,
      expiresAt: signed.expiresAt,
      user: myParticipant.user,
    };
  }

  async postMessage(
    actorUserId: string,
    orgId: string,
    projectId: string,
    sessionId: string,
    projectContext: ProjectContext,
    body: { body?: unknown; filePath?: unknown; lineNumber?: unknown },
  ): Promise<CollabMessageDto> {
    const { session } = await this.loadAuthorizedSession(
      actorUserId,
      orgId,
      projectId,
      sessionId,
      projectContext,
      { requireActiveParticipant: true },
    );

    const text = sanitizeOptionalText(body.body, 2000, "Discussion message");
    if (!text) {
      throw new BadRequestException("Discussion message cannot be empty.");
    }
    const filePath = sanitizeOptionalText(body.filePath, 300, "File path");
    const lineNumber =
      typeof body.lineNumber === "number" &&
      Number.isInteger(body.lineNumber) &&
      body.lineNumber > 0 &&
      body.lineNumber < 500_000
        ? body.lineNumber
        : null;

    const msg = await this.db.prisma.collabMessage.create({
      data: {
        sessionId: session.id,
        organizationId: orgId,
        projectId,
        authorId: actorUserId,
        body: text,
        filePath,
        lineNumber,
      },
      include: { author: { select: USER_SELECT } },
    });

    await this.db.prisma.collabSession.update({
      where: { id: session.id },
      data: { lastActivityAt: new Date() },
    });

    return this.toMessageDto(msg);
  }
}
