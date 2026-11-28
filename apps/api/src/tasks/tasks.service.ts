import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  MyTaskItemDto,
  MyTasksResponseDto,
  OrganizationRole,
  ProjectTaskSummaryDto,
  ProjectTasksListResponseDto,
  TaskActivityDto,
  TaskActivityType,
  TaskCommentDto,
  TaskDetailDto,
  TaskPriority,
  TaskStatus,
  TaskSummaryDto,
} from "@devcollab/shared";
import { AuthorizationService } from "../authorization/authorization.service";
import {
  emptyTaskSummary,
  toLinkedPullRequestRefDto,
  toOrganizationMemberDto,
  toProjectDetailDto,
  toTaskActivityDto,
  toTaskCommentDto,
  toTaskSummaryDto,
} from "../common/mappers";
import { toAgentRunSummaryDto } from "../ai/ai.mappers";
import {
  normalizeTaskLabels,
  optionalDueDate,
  optionalTaskDescription,
  parseTaskPriority,
  parseTaskStatus,
  requireCommentBody,
  requireTaskTitle,
} from "../common/validation";
import { DatabaseService } from "../database/database.service";

const STATUS_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

function actorLabel(user: { name: string | null; email: string } | null | undefined): string {
  return user?.name?.trim() || user?.email || "A teammate";
}

function sameStringArray(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, idx) => item === b[idx]);
}

@Injectable()
export class TasksService {
  constructor(
    private readonly db: DatabaseService,
    private readonly authz: AuthorizationService,
  ) {}

  async getProjectTaskSummary(orgId: string, projectId: string): Promise<ProjectTaskSummaryDto> {
    const now = new Date();
    const [statusGroups, priorityGroups, overdue, unassigned, archived] = await Promise.all([
      this.db.prisma.task.groupBy({
        by: ["status"],
        where: { organizationId: orgId, projectId, archivedAt: null },
        _count: { _all: true },
      }),
      this.db.prisma.task.groupBy({
        by: ["priority"],
        where: { organizationId: orgId, projectId, archivedAt: null },
        _count: { _all: true },
      }),
      this.db.prisma.task.count({
        where: {
          organizationId: orgId,
          projectId,
          archivedAt: null,
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
      }),
      this.db.prisma.task.count({
        where: {
          organizationId: orgId,
          projectId,
          archivedAt: null,
          assigneeId: null,
        },
      }),
      this.db.prisma.task.count({
        where: {
          organizationId: orgId,
          projectId,
          archivedAt: { not: null },
        },
      }),
    ]);

    const summary = emptyTaskSummary();
    for (const row of statusGroups) {
      const count = row._count._all;
      summary.totalActive += count;
      if (row.status === "BACKLOG") summary.backlog = count;
      else if (row.status === "TODO") summary.todo = count;
      else if (row.status === "IN_PROGRESS") summary.inProgress = count;
      else if (row.status === "IN_REVIEW") summary.inReview = count;
      else if (row.status === "DONE") summary.done = count;
    }
    for (const row of priorityGroups) {
      summary.priorityBreakdown[row.priority] = row._count._all;
    }
    summary.overdue = overdue;
    summary.unassigned = unassigned;
    summary.archived = archived;
    return summary;
  }

  async listRecentProjectTasks(
    orgId: string,
    projectId: string,
    take = 5,
  ): Promise<TaskSummaryDto[]> {
    const rows = await this.db.prisma.task.findMany({
      where: { organizationId: orgId, projectId, archivedAt: null },
      orderBy: [{ updatedAt: "desc" }],
      take,
      include: {
        assignee: { select: USER_SELECT },
        creator: { select: USER_SELECT },
        _count: { select: { comments: true } },
      },
    });
    return rows.map(toTaskSummaryDto);
  }

  async listRecentTaskActivity(
    orgId: string,
    projectId: string,
    take = 12,
  ): Promise<TaskActivityDto[]> {
    const rows = await this.db.prisma.taskActivity.findMany({
      where: {
        projectId,
        project: { organizationId: orgId },
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: { actor: { select: USER_SELECT } },
    });
    return rows.map(toTaskActivityDto);
  }

  async listProjectTasks(
    orgId: string,
    projectId: string,
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    query: {
      search?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      overdue?: string;
      mine?: string;
      archived?: string;
      sort?: string;
      page?: string;
      limit?: string;
    },
  ): Promise<ProjectTasksListResponseDto> {
    const showArchived = query.archived === "true";
    const where: Record<string, unknown> = {
      organizationId: orgId,
      projectId,
      archivedAt: showArchived ? { not: null } : null,
    };

    if (query.status && query.status !== "ALL") {
      where.status = parseTaskStatus(query.status);
    }
    if (query.priority && query.priority !== "ALL") {
      where.priority = parseTaskPriority(query.priority);
    }
    if (query.mine === "true") {
      where.assigneeId = actorUserId;
    } else if (query.assigneeId === "UNASSIGNED") {
      where.assigneeId = null;
    } else if (query.assigneeId && query.assigneeId !== "ALL") {
      where.assigneeId = query.assigneeId.trim();
    }
    if (query.overdue === "true") {
      where.status = where.status ?? { not: "DONE" };
      where.dueDate = { lt: new Date() };
    }
    const q = query.search?.trim();
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { identifier: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(200, Math.max(1, Number.parseInt(query.limit ?? "100", 10) || 100));
    const skip = (page - 1) * pageSize;

    const orderBy =
      query.sort === "oldest"
        ? [{ createdAt: "asc" as const }]
        : query.sort === "newest"
          ? [{ createdAt: "desc" as const }]
          : query.sort === "dueDate"
            ? [{ dueDate: { sort: "asc" as const, nulls: "last" as const } }, { priority: "asc" as const }]
            : [{ priority: "asc" as const }, { updatedAt: "desc" as const }, { sequenceNumber: "desc" as const }];

    const [project, orgMembers, total, tasks, summary] = await Promise.all([
      this.db.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            include: { user: { select: USER_SELECT } },
          },
        },
      }),
      this.db.prisma.organizationMembership.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        include: { user: { select: USER_SELECT } },
      }),
      this.db.prisma.task.count({ where: where as never }),
      this.db.prisma.task.findMany({
        where: where as never,
        orderBy,
        skip,
        take: pageSize,
        include: {
          assignee: { select: USER_SELECT },
          creator: { select: USER_SELECT },
          _count: { select: { comments: true } },
        },
      }),
      this.getProjectTaskSummary(orgId, projectId),
    ]);

    if (!project) {
      throw new NotFoundException("Project not found in this organization.");
    }

    return {
      project: toProjectDetailDto(project, actorUserId, actorOrgRole),
      orgMembers: orgMembers.map(toOrganizationMemberDto),
      items: tasks.map(toTaskSummaryDto),
      total,
      page,
      pageSize,
      summary,
    };
  }

  async createTask(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    body: {
      title?: unknown;
      description?: unknown;
      status?: unknown;
      priority?: unknown;
      assigneeId?: unknown;
      dueDate?: unknown;
      labels?: unknown;
    },
  ): Promise<TaskDetailDto> {
    const title = requireTaskTitle(body?.title);
    const description = optionalTaskDescription(body?.description);
    const status = parseTaskStatus(body?.status, "TODO");
    const priority = parseTaskPriority(body?.priority, "MEDIUM");
    const dueDate = optionalDueDate(body?.dueDate);
    const labels = normalizeTaskLabels(body?.labels);
    const assigneeId =
      typeof body?.assigneeId === "string" && body.assigneeId.trim() ? body.assigneeId.trim() : null;

    const [project, actor, assigneeMember] = await Promise.all([
      this.db.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true, status: true, key: true },
      }),
      this.db.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      }),
      assigneeId
        ? this.db.prisma.organizationMembership.findUnique({
            where: { organizationId_userId: { organizationId: orgId, userId: assigneeId } },
            select: { status: true },
          })
        : Promise.resolve(null),
    ]);

    if (!project) {
      throw new NotFoundException("Project not found in this organization.");
    }
    if (project.status === "ARCHIVED") {
      throw new ConflictException("This project is archived. Restore it before creating tasks.");
    }
    if (assigneeId && (!assigneeMember || assigneeMember.status !== "ACTIVE")) {
      throw new BadRequestException("Assignee must be an active member of this organization.");
    }

    const createdId = await this.db.prisma.$transaction(async (tx) => {
      const updatedProject = await tx.project.update({
        where: { id: projectId },
        data: { nextTaskNumber: { increment: 1 } },
        select: { key: true, nextTaskNumber: true },
      });
      const sequenceNumber = updatedProject.nextTaskNumber - 1;
      const identifier = `${updatedProject.key}-${String(sequenceNumber).padStart(3, "0")}`;
      const now = new Date();

      const task = await tx.task.create({
        data: {
          organizationId: orgId,
          projectId,
          sequenceNumber,
          identifier,
          title,
          description,
          status,
          priority,
          assigneeId,
          creatorId: actorUserId,
          dueDate,
          labels,
          completedAt: status === "DONE" ? now : null,
        },
        select: { id: true },
      });

      const who = actorLabel(actor);
      await tx.taskActivity.create({
        data: {
          taskId: task.id,
          projectId,
          actorId: actorUserId,
          eventType: "TASK_CREATED",
          newValue: STATUS_LABELS[status],
          summary: `${who} created ${identifier}`,
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "TASK_CREATED",
          summary: `Created task ${identifier}: ${title}`,
        },
      });

      return task.id;
    });

    return this.getTaskDetail(orgId, projectId, createdId, actorUserId, canManageProject);
  }

  async getTaskDetail(
    orgId: string,
    projectId: string,
    taskId: string,
    actorUserId: string,
    canManageProject: boolean,
    canRunAi = false,
  ): Promise<TaskDetailDto> {
    const [task, linkedPrRows, latestRunRow] = await Promise.all([
      this.db.prisma.task.findFirst({
        where: { id: taskId, projectId, organizationId: orgId },
        include: {
          project: { select: { name: true, key: true, status: true } },
          assignee: { select: USER_SELECT },
          creator: { select: USER_SELECT },
          _count: { select: { comments: true } },
          comments: {
            orderBy: [{ createdAt: "asc" }],
            include: { author: { select: USER_SELECT } },
          },
          activities: {
            orderBy: [{ createdAt: "desc" }],
            take: 100,
            include: { actor: { select: USER_SELECT } },
          },
        },
      }),
      this.db.prisma.taskPullRequestLink
        ? this.db.prisma.taskPullRequestLink.findMany({
            where: {
              organizationId: orgId,
              projectId,
              taskId,
              pullRequest: { projectRepository: { status: "CONNECTED" } },
            },
            orderBy: [{ createdAt: "desc" }],
            include: {
              pullRequest: {
                include: {
                  projectRepository: { select: { fullName: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      this.db.prisma.agentRun
        ? this.db.prisma.agentRun.findFirst({
            where: { organizationId: orgId, projectId, taskId },
            orderBy: [{ createdAt: "desc" }],
            include: {
              triggeredBy: { select: USER_SELECT },
              usageRecords: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!task) {
      throw new NotFoundException("Task not found in this project.");
    }

    const isEditable = task.project.status === "ACTIVE" && task.archivedAt === null;

    return {
      ...toTaskSummaryDto(task),
      description: task.description,
      projectStatus: task.project.status,
      projectName: task.project.name,
      projectKey: task.project.key,
      canEditTask: isEditable,
      canArchiveTask: canManageProject && task.project.status === "ACTIVE",
      canRunAi,
      latestAgentRun: latestRunRow ? toAgentRunSummaryDto(latestRunRow) : null,
      comments: task.comments.map((c) => toTaskCommentDto(c, actorUserId, canManageProject)),
      activities: task.activities.map(toTaskActivityDto),
      linkedPullRequests: linkedPrRows.map(toLinkedPullRequestRefDto),
    };
  }

  async updateTask(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
    body: {
      title?: unknown;
      description?: unknown;
      status?: unknown;
      priority?: unknown;
      assigneeId?: unknown;
      dueDate?: unknown;
      labels?: unknown;
    },
  ): Promise<TaskDetailDto> {
    const hasTitle = body?.title !== undefined;
    const hasDescription = body?.description !== undefined;
    const hasStatus = body?.status !== undefined;
    const hasPriority = body?.priority !== undefined;
    const hasAssignee = body?.assigneeId !== undefined;
    const hasDueDate = body?.dueDate !== undefined;
    const hasLabels = body?.labels !== undefined;

    if (
      !hasTitle &&
      !hasDescription &&
      !hasStatus &&
      !hasPriority &&
      !hasAssignee &&
      !hasDueDate &&
      !hasLabels
    ) {
      throw new BadRequestException("Provide at least one field to update.");
    }

    const nextTitle = hasTitle ? requireTaskTitle(body.title) : undefined;
    const nextDescription = hasDescription ? optionalTaskDescription(body.description) : undefined;
    const nextStatus = hasStatus ? parseTaskStatus(body.status) : undefined;
    const nextPriority = hasPriority ? parseTaskPriority(body.priority) : undefined;
    const nextDueDate = hasDueDate ? optionalDueDate(body.dueDate) : undefined;
    const nextLabels = hasLabels ? normalizeTaskLabels(body.labels) : undefined;
    const nextAssigneeId = hasAssignee
      ? typeof body.assigneeId === "string" && body.assigneeId.trim()
        ? body.assigneeId.trim()
        : null
      : undefined;

    await this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id: taskId, projectId, organizationId: orgId },
        include: {
          project: { select: { status: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      if (!existing) {
        throw new NotFoundException("Task not found in this project.");
      }
      if (existing.project.status === "ARCHIVED") {
        throw new ConflictException("This project is archived. Restore it before updating tasks.");
      }
      if (existing.archivedAt !== null) {
        throw new ConflictException("This task is archived. Restore it before editing.");
      }

      let nextAssigneeUser: { id: string; name: string | null; email: string } | null = null;
      if (nextAssigneeId !== undefined && nextAssigneeId !== null) {
        const membership = await tx.organizationMembership.findUnique({
          where: { organizationId_userId: { organizationId: orgId, userId: nextAssigneeId } },
          include: { user: { select: { id: true, name: true, email: true } } },
        });
        if (!membership || membership.status !== "ACTIVE") {
          throw new BadRequestException("Assignee must be an active member of this organization.");
        }
        nextAssigneeUser = membership.user;
      }

      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      });
      const who = actorLabel(actor);

      let completedAtUpdate: Date | null | undefined;
      if (nextStatus !== undefined && nextStatus !== existing.status) {
        if (nextStatus === "DONE") completedAtUpdate = new Date();
        else if (existing.status === "DONE") completedAtUpdate = null;
      }

      await tx.task.update({
        where: { id: existing.id },
        data: {
          ...(nextTitle !== undefined ? { title: nextTitle } : {}),
          ...(nextDescription !== undefined ? { description: nextDescription } : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
          ...(nextPriority !== undefined ? { priority: nextPriority } : {}),
          ...(nextAssigneeId !== undefined ? { assigneeId: nextAssigneeId } : {}),
          ...(nextDueDate !== undefined ? { dueDate: nextDueDate } : {}),
          ...(nextLabels !== undefined ? { labels: nextLabels } : {}),
          ...(completedAtUpdate !== undefined ? { completedAt: completedAtUpdate } : {}),
        },
      });

      const events: Array<{
        taskId: string;
        projectId: string;
        actorId: string;
        eventType: TaskActivityType;
        field: string;
        oldValue: string | null;
        newValue: string | null;
        summary: string;
      }> = [];

      if (nextTitle !== undefined && nextTitle !== existing.title) {
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "TITLE_UPDATED",
          field: "title",
          oldValue: existing.title.slice(0, 80),
          newValue: nextTitle.slice(0, 80),
          summary: `${who} updated the title of ${existing.identifier}`,
        });
      }

      if (nextDescription !== undefined && nextDescription !== existing.description) {
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "DESCRIPTION_UPDATED",
          field: "description",
          oldValue: null,
          newValue: null,
          summary: `${who} updated the description of ${existing.identifier}`,
        });
      }

      if (nextStatus !== undefined && nextStatus !== existing.status) {
        const oldLabel = STATUS_LABELS[existing.status];
        const newLabel = STATUS_LABELS[nextStatus];
        if (nextStatus === "DONE") {
          events.push({
            taskId: existing.id,
            projectId,
            actorId: actorUserId,
            eventType: "TASK_COMPLETED",
            field: "status",
            oldValue: oldLabel,
            newValue: newLabel,
            summary: `${who} completed ${existing.identifier} (from ${oldLabel})`,
          });
        } else if (existing.status === "DONE") {
          events.push({
            taskId: existing.id,
            projectId,
            actorId: actorUserId,
            eventType: "TASK_REOPENED",
            field: "status",
            oldValue: oldLabel,
            newValue: newLabel,
            summary: `${who} reopened ${existing.identifier} to ${newLabel}`,
          });
        } else {
          events.push({
            taskId: existing.id,
            projectId,
            actorId: actorUserId,
            eventType: "STATUS_CHANGED",
            field: "status",
            oldValue: oldLabel,
            newValue: newLabel,
            summary: `${who} moved ${existing.identifier} from ${oldLabel} to ${newLabel}`,
          });
        }
      }

      if (nextPriority !== undefined && nextPriority !== existing.priority) {
        const oldP = PRIORITY_LABELS[existing.priority];
        const newP = PRIORITY_LABELS[nextPriority];
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "PRIORITY_CHANGED",
          field: "priority",
          oldValue: oldP,
          newValue: newP,
          summary: `${who} changed priority of ${existing.identifier} from ${oldP} to ${newP}`,
        });
      }

      if (nextAssigneeId !== undefined && nextAssigneeId !== existing.assigneeId) {
        const oldName = existing.assignee ? actorLabel(existing.assignee) : "Unassigned";
        const newName = nextAssigneeUser ? actorLabel(nextAssigneeUser) : "Unassigned";
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "ASSIGNEE_CHANGED",
          field: "assignee",
          oldValue: oldName,
          newValue: newName,
          summary:
            newName === "Unassigned"
              ? `${who} unassigned ${existing.identifier}`
              : `${who} assigned ${existing.identifier} to ${newName}`,
        });
      }

      const oldIsoDate = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;
      const newIsoDate = nextDueDate ? nextDueDate.toISOString().slice(0, 10) : null;
      if (nextDueDate !== undefined && oldIsoDate !== newIsoDate) {
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "DUE_DATE_CHANGED",
          field: "dueDate",
          oldValue: oldIsoDate,
          newValue: newIsoDate,
          summary: newIsoDate
            ? `${who} set due date of ${existing.identifier} to ${newIsoDate}`
            : `${who} cleared due date of ${existing.identifier}`,
        });
      }

      if (nextLabels !== undefined && !sameStringArray(nextLabels, existing.labels)) {
        events.push({
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: "LABELS_UPDATED",
          field: "labels",
          oldValue: existing.labels.join(", ") || null,
          newValue: nextLabels.join(", ") || null,
          summary: `${who} updated labels on ${existing.identifier}`,
        });
      }

      for (const evt of events) {
        await tx.taskActivity.create({ data: evt });
      }
    });

    return this.getTaskDetail(orgId, projectId, taskId, actorUserId, canManageProject);
  }

  async setArchiveState(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
    archive: boolean,
  ): Promise<TaskDetailDto> {
    await this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id: taskId, projectId, organizationId: orgId },
        include: { project: { select: { status: true } } },
      });
      if (!existing) {
        throw new NotFoundException("Task not found in this project.");
      }
      if (existing.project.status === "ARCHIVED") {
        throw new ConflictException("Restore the parent project before changing task archive state.");
      }
      if (archive && existing.archivedAt !== null) {
        throw new ConflictException("This task is already archived.");
      }
      if (!archive && existing.archivedAt === null) {
        throw new ConflictException("This task is already active.");
      }

      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { name: true, email: true },
      });
      const who = actorLabel(actor);

      await tx.task.update({
        where: { id: existing.id },
        data: { archivedAt: archive ? new Date() : null },
      });

      await tx.taskActivity.create({
        data: {
          taskId: existing.id,
          projectId,
          actorId: actorUserId,
          eventType: archive ? "TASK_ARCHIVED" : "TASK_RESTORED",
          summary: `${who} ${archive ? "archived" : "restored"} ${existing.identifier}`,
        },
      });
    });

    return this.getTaskDetail(orgId, projectId, taskId, actorUserId, canManageProject);
  }

  async listComments(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskCommentDto[]> {
    const task = await this.db.prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException("Task not found in this project.");
    }
    const comments = await this.db.prisma.taskComment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "asc" }],
      include: { author: { select: USER_SELECT } },
    });
    return comments.map((c) => toTaskCommentDto(c, actorUserId, canManageProject));
  }

  async addComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
    bodyInput: unknown,
  ): Promise<TaskCommentDto> {
    const body = requireCommentBody(bodyInput);

    const task = await this.db.prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId: orgId },
      include: { project: { select: { status: true } } },
    });
    if (!task) {
      throw new NotFoundException("Task not found in this project.");
    }
    if (task.project.status === "ARCHIVED" || task.archivedAt !== null) {
      throw new ConflictException("Comments cannot be added to archived tasks or projects.");
    }

    const comment = await this.db.prisma.taskComment.create({
      data: {
        taskId,
        authorId: actorUserId,
        body,
      },
      include: { author: { select: USER_SELECT } },
    });

    return toTaskCommentDto(comment, actorUserId, canManageProject);
  }

  async editComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    bodyInput: unknown,
  ): Promise<TaskCommentDto> {
    const body = requireCommentBody(bodyInput);

    const comment = await this.db.prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId,
        task: { projectId, organizationId: orgId },
      },
      include: {
        task: { select: { archivedAt: true, project: { select: { status: true } } } },
      },
    });
    if (!comment) {
      throw new NotFoundException("Comment not found.");
    }
    if (comment.authorId !== actorUserId) {
      throw new ForbiddenException("You can only edit your own comments.");
    }
    if (comment.task.project.status === "ARCHIVED" || comment.task.archivedAt !== null) {
      throw new ConflictException("Comments cannot be edited on archived tasks or projects.");
    }

    const updated = await this.db.prisma.taskComment.update({
      where: { id: comment.id },
      data: { body, editedAt: new Date() },
      include: { author: { select: USER_SELECT } },
    });

    return toTaskCommentDto(updated, actorUserId, canManageProject);
  }

  async deleteComment(
    actorUserId: string,
    canManageProject: boolean,
    orgId: string,
    projectId: string,
    taskId: string,
    commentId: string,
  ): Promise<{ deleted: true }> {
    const comment = await this.db.prisma.taskComment.findFirst({
      where: {
        id: commentId,
        taskId,
        task: { projectId, organizationId: orgId },
      },
      include: {
        task: { select: { archivedAt: true, project: { select: { status: true } } } },
      },
    });
    if (!comment) {
      throw new NotFoundException("Comment not found.");
    }
    if (comment.authorId !== actorUserId && !canManageProject) {
      throw new ForbiddenException("You do not have permission to delete this comment.");
    }
    if (comment.task.project.status === "ARCHIVED" || comment.task.archivedAt !== null) {
      throw new ConflictException("Comments cannot be deleted on archived tasks or projects.");
    }

    await this.db.prisma.taskComment.delete({ where: { id: comment.id } });
    return { deleted: true };
  }

  async listActivity(
    orgId: string,
    projectId: string,
    taskId: string,
  ): Promise<TaskActivityDto[]> {
    const task = await this.db.prisma.task.findFirst({
      where: { id: taskId, projectId, organizationId: orgId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException("Task not found in this project.");
    }
    const items = await this.db.prisma.taskActivity.findMany({
      where: { taskId },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      include: { actor: { select: USER_SELECT } },
    });
    return items.map(toTaskActivityDto);
  }

  async getMyTasks(
    actorUserId: string,
    options: { orgId?: string; scope?: string; filter?: string },
  ): Promise<MyTasksResponseDto> {
    let scopedOrgId: string | undefined;
    if (options.scope !== "all" && options.orgId) {
      const orgCtx = await this.authz.requireOrgMembership(actorUserId, options.orgId);
      scopedOrgId = orgCtx.organization.id;
    }

    const rows = await this.db.prisma.task.findMany({
      where: {
        assigneeId: actorUserId,
        archivedAt: null,
        project: { status: "ACTIVE" },
        organization: {
          ...(scopedOrgId ? { id: scopedOrgId } : {}),
          memberships: { some: { userId: actorUserId, status: "ACTIVE" } },
        },
      },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "asc" }, { updatedAt: "desc" }],
      include: {
        assignee: { select: USER_SELECT },
        creator: { select: USER_SELECT },
        _count: { select: { comments: true } },
        project: { select: { name: true, key: true } },
        organization: { select: { name: true, slug: true } },
      },
    });

    const now = new Date();
    const soonLimit = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const allItems: MyTaskItemDto[] = rows.map((row) => ({
      ...toTaskSummaryDto(row),
      projectName: row.project.name,
      projectKey: row.project.key,
      organizationName: row.organization.name,
      organizationSlug: row.organization.slug,
    }));

    const counts = {
      active: allItems.filter((t) => t.status !== "DONE").length,
      dueSoon: allItems.filter(
        (t) =>
          t.status !== "DONE" &&
          t.dueDate !== null &&
          new Date(t.dueDate) >= now &&
          new Date(t.dueDate) <= soonLimit,
      ).length,
      overdue: allItems.filter(
        (t) => t.status !== "DONE" && t.dueDate !== null && new Date(t.dueDate) < now,
      ).length,
      completed: allItems.filter((t) => t.status === "DONE").length,
      all: allItems.length,
    };

    const filter = options.filter ?? "active";
    const items = allItems.filter((t) => {
      if (filter === "all") return true;
      if (filter === "completed") return t.status === "DONE";
      if (filter === "overdue") {
        return t.status !== "DONE" && t.dueDate !== null && new Date(t.dueDate) < now;
      }
      if (filter === "dueSoon") {
        return (
          t.status !== "DONE" &&
          t.dueDate !== null &&
          new Date(t.dueDate) >= now &&
          new Date(t.dueDate) <= soonLimit
        );
      }
      return t.status !== "DONE";
    });

    return { items, counts };
  }
}
