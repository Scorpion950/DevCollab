import type {
  AuditLogEntryDto,
  OrganizationMemberDto,
  OrganizationRole,
  OrganizationSummary,
  ProjectDetailDto,
  ProjectPersonDto,
  ProjectRole,
  ProjectStatus,
  ProjectSummaryDto,
  ProjectTaskSummaryDto,
  TaskActivityDto,
  TaskActivityType,
  TaskCommentDto,
  TaskPriority,
  TaskStatus,
  TaskSummaryDto,
  TaskUserRef,
} from "@devcollab/shared";

export function toOrganizationSummary(input: {
  role: OrganizationRole;
  status: "ACTIVE";
  joinedAt: Date;
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
    _count: { memberships: number; projects: number };
  };
}): OrganizationSummary {
  return {
    id: input.organization.id,
    name: input.organization.name,
    slug: input.organization.slug,
    description: input.organization.description,
    role: input.role,
    status: input.status,
    memberCount: input.organization._count.memberships,
    projectCount: input.organization._count.projects,
    joinedAt: input.joinedAt.toISOString(),
    createdAt: input.organization.createdAt.toISOString(),
  };
}

export function toOrganizationMemberDto(input: {
  id: string;
  userId: string;
  role: OrganizationRole;
  status: "ACTIVE";
  joinedAt: Date;
  user: { id: string; name: string | null; email: string; image: string | null };
}): OrganizationMemberDto {
  return {
    id: input.id,
    userId: input.userId,
    name: input.user.name,
    email: input.user.email,
    image: input.user.image,
    role: input.role,
    status: input.status,
    joinedAt: input.joinedAt.toISOString(),
  };
}

export function toProjectPersonDto(input: {
  userId: string;
  role: ProjectRole;
  createdAt: Date;
  user: { id: string; name: string | null; email: string; image: string | null };
}): ProjectPersonDto {
  return {
    userId: input.userId,
    name: input.user.name,
    email: input.user.email,
    image: input.user.image,
    role: input.role,
    assignedAt: input.createdAt.toISOString(),
  };
}

export function toProjectSummaryDto(
  project: {
    id: string;
    organizationId: string;
    name: string;
    key: string;
    slug: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    roleAssignments: Array<{
      userId: string;
      role: ProjectRole;
      createdAt: Date;
      user: { id: string; name: string | null; email: string; image: string | null };
    }>;
  },
  actorUserId: string,
  actorOrgRole: OrganizationRole,
): ProjectSummaryDto {
  const people = project.roleAssignments.map(toProjectPersonDto);
  const projectManagers = people.filter((person) => person.role === "PROJECT_MANAGER");
  const currentAssignment = people.find((person) => person.userId === actorUserId) ?? null;
  const canManageProject =
    actorOrgRole === "OWNER" ||
    actorOrgRole === "ADMIN" ||
    currentAssignment?.role === "PROJECT_MANAGER";

  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    key: project.key,
    slug: project.slug,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : null,
    projectManagers,
    currentUserProjectRole: currentAssignment?.role ?? null,
    canManageProject,
  };
}

export function toProjectDetailDto(
  project: {
    id: string;
    organizationId: string;
    name: string;
    key: string;
    slug: string;
    description: string | null;
    status: ProjectStatus;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
    createdBy: { id: string; name: string | null; email: string } | null;
    roleAssignments: Array<{
      userId: string;
      role: ProjectRole;
      createdAt: Date;
      user: { id: string; name: string | null; email: string; image: string | null };
    }>;
  },
  actorUserId: string,
  actorOrgRole: OrganizationRole,
): ProjectDetailDto {
  const summary = toProjectSummaryDto(project, actorUserId, actorOrgRole);
  const members = project.roleAssignments.map(toProjectPersonDto);
  return {
    ...summary,
    createdBy: project.createdBy,
    members,
  };
}

export function toAuditLogEntryDto(entry: {
  id: string;
  action: string;
  summary: string;
  createdAt: Date;
  projectId: string | null;
  actor: { id: string; name: string | null; email: string } | null;
}): AuditLogEntryDto {
  return {
    id: entry.id,
    action: entry.action,
    summary: entry.summary,
    createdAt: entry.createdAt.toISOString(),
    projectId: entry.projectId,
    actor: entry.actor,
  };
}

export function toTaskSummaryDto(task: {
  id: string;
  organizationId: string;
  projectId: string;
  sequenceNumber: number;
  identifier: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  dueDate: Date | null;
  completedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  assignee: TaskUserRef | null;
  creator: TaskUserRef | null;
  _count: { comments: number };
}): TaskSummaryDto {
  return {
    id: task.id,
    organizationId: task.organizationId,
    projectId: task.projectId,
    sequenceNumber: task.sequenceNumber,
    identifier: task.identifier,
    title: task.title,
    status: task.status,
    priority: task.priority,
    labels: task.labels,
    dueDate: task.dueDate ? task.dueDate.toISOString() : null,
    completedAt: task.completedAt ? task.completedAt.toISOString() : null,
    archivedAt: task.archivedAt ? task.archivedAt.toISOString() : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    assignee: task.assignee,
    creator: task.creator,
    commentCount: task._count.comments,
  };
}

export function toTaskCommentDto(
  comment: {
    id: string;
    taskId: string;
    authorId: string | null;
    body: string;
    editedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    author: TaskUserRef | null;
  },
  actorUserId: string,
  canManageProject: boolean,
): TaskCommentDto {
  const isAuthor = comment.authorId === actorUserId;
  return {
    id: comment.id,
    taskId: comment.taskId,
    authorId: comment.authorId,
    body: comment.body,
    editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    author: comment.author,
    canEdit: isAuthor,
    canDelete: isAuthor || canManageProject,
  };
}

export function toTaskActivityDto(activity: {
  id: string;
  taskId: string;
  projectId: string;
  actorId: string | null;
  eventType: TaskActivityType;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string;
  createdAt: Date;
  actor: TaskUserRef | null;
}): TaskActivityDto {
  return {
    id: activity.id,
    taskId: activity.taskId,
    projectId: activity.projectId,
    actorId: activity.actorId,
    eventType: activity.eventType,
    field: activity.field,
    oldValue: activity.oldValue,
    newValue: activity.newValue,
    summary: activity.summary,
    createdAt: activity.createdAt.toISOString(),
    actor: activity.actor,
  };
}

export function emptyTaskSummary(): ProjectTaskSummaryDto {
  return {
    totalActive: 0,
    backlog: 0,
    todo: 0,
    inProgress: 0,
    inReview: 0,
    done: 0,
    overdue: 0,
    unassigned: 0,
    archived: 0,
    priorityBreakdown: {
      URGENT: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    },
  };
}
