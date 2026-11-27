import type {
  AuditLogEntryDto,
  DiffLineSide,
  GitHubInstallationDto,
  GitHubInstallationStatus,
  InternalReviewDecision,
  LinkedPullRequestRefDto,
  OrganizationMemberDto,
  OrganizationRole,
  OrganizationSummary,
  ProjectDetailDto,
  ProjectPersonDto,
  ProjectRepositoryDto,
  ProjectRepositorySummaryDto,
  ProjectRole,
  ProjectStatus,
  ProjectSummaryDto,
  ProjectTaskSummaryDto,
  PullRequestInternalReviewDto,
  PullRequestLinkedTaskDto,
  PullRequestReviewCommentDto,
  PullRequestState,
  PullRequestSummaryDto,
  RepositoryConnectionStatus,
  ReviewThreadStatus,
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

export function toGitHubInstallationDto(inst: {
  id: string;
  githubInstallationId: string;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  status: GitHubInstallationStatus;
  suspendedAt: Date | null;
}): GitHubInstallationDto {
  return {
    id: inst.id,
    githubInstallationId: inst.githubInstallationId,
    accountLogin: inst.accountLogin,
    accountType: inst.accountType,
    accountAvatarUrl: inst.accountAvatarUrl,
    status: inst.status,
    suspendedAt: inst.suspendedAt ? inst.suspendedAt.toISOString() : null,
  };
}

export function toProjectRepositorySummaryDto(repo: {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  status: RepositoryConnectionStatus;
  openPrCount: number;
  lastSyncedAt: Date | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}): ProjectRepositorySummaryDto {
  return {
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
    defaultBranch: repo.defaultBranch,
    isPrivate: repo.isPrivate,
    htmlUrl: repo.htmlUrl,
    status: repo.status,
    openPrCount: repo.openPrCount,
    lastSyncedAt: repo.lastSyncedAt ? repo.lastSyncedAt.toISOString() : null,
    lastSyncStatus: repo.lastSyncStatus,
    lastSyncError: repo.lastSyncError,
  };
}

export function toProjectRepositoryDto(
  repo: {
    id: string;
    projectId: string;
    organizationId: string;
    installationId: string;
    githubRepoId: string;
    owner: string;
    name: string;
    fullName: string;
    defaultBranch: string;
    description: string | null;
    htmlUrl: string;
    isPrivate: boolean;
    status: RepositoryConnectionStatus;
    connectedAt: Date;
    lastSyncedAt: Date | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    openPrCount: number;
    installation: {
      githubInstallationId: string;
      status: GitHubInstallationStatus;
      accountLogin: string;
      accountType: string;
    };
  },
  canManage: boolean,
): ProjectRepositoryDto {
  return {
    ...toProjectRepositorySummaryDto(repo),
    projectId: repo.projectId,
    organizationId: repo.organizationId,
    githubRepoId: repo.githubRepoId,
    description: repo.description,
    connectedAt: repo.connectedAt.toISOString(),
    installationId: repo.installationId,
    githubInstallationId: repo.installation.githubInstallationId,
    installationStatus: repo.installation.status,
    accountLogin: repo.installation.accountLogin,
    accountType: repo.installation.accountType,
    canManage,
  };
}

export function toPullRequestSummaryDto(pr: {
  id: string;
  projectRepositoryId: string;
  githubPrId: string;
  number: number;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  authorLogin: string;
  authorAvatarUrl: string | null;
  headRef: string;
  baseRef: string;
  headSha: string;
  mergeableState: string | null;
  githubReviewDecision: string | null;
  additions: number;
  deletions: number;
  changedFilesCount: number;
  htmlUrl: string;
  githubCreatedAt: Date;
  githubUpdatedAt: Date;
  mergedAt: Date | null;
  closedAt: Date | null;
  lastSyncedAt: Date;
  _count?: { reviewComments: number; taskLinks: number };
}): PullRequestSummaryDto {
  return {
    id: pr.id,
    projectRepositoryId: pr.projectRepositoryId,
    githubPrId: pr.githubPrId,
    number: pr.number,
    title: pr.title,
    state: pr.state,
    isDraft: pr.isDraft,
    authorLogin: pr.authorLogin,
    authorAvatarUrl: pr.authorAvatarUrl,
    headRef: pr.headRef,
    baseRef: pr.baseRef,
    headSha: pr.headSha,
    mergeableState: pr.mergeableState,
    githubReviewDecision: pr.githubReviewDecision,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFilesCount: pr.changedFilesCount,
    internalCommentCount: pr._count?.reviewComments ?? 0,
    linkedTaskCount: pr._count?.taskLinks ?? 0,
    htmlUrl: pr.htmlUrl,
    githubCreatedAt: pr.githubCreatedAt.toISOString(),
    githubUpdatedAt: pr.githubUpdatedAt.toISOString(),
    mergedAt: pr.mergedAt ? pr.mergedAt.toISOString() : null,
    closedAt: pr.closedAt ? pr.closedAt.toISOString() : null,
    lastSyncedAt: pr.lastSyncedAt.toISOString(),
  };
}

export function toPullRequestReviewCommentDto(
  comment: {
    id: string;
    pullRequestId: string;
    authorId: string | null;
    body: string;
    filePath: string | null;
    lineNumber: number | null;
    lineSide: DiffLineSide | null;
    commitSha: string;
    status: ReviewThreadStatus;
    resolvedAt: Date | null;
    editedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    author: TaskUserRef | null;
    resolvedBy: TaskUserRef | null;
  },
  currentHeadSha: string,
  actorUserId: string,
  canManageProject: boolean,
): PullRequestReviewCommentDto {
  const isAuthor = comment.authorId === actorUserId;
  return {
    id: comment.id,
    pullRequestId: comment.pullRequestId,
    authorId: comment.authorId,
    author: comment.author,
    body: comment.body,
    filePath: comment.filePath,
    lineNumber: comment.lineNumber,
    lineSide: comment.lineSide,
    commitSha: comment.commitSha,
    isOutdated: Boolean(currentHeadSha && comment.commitSha !== currentHeadSha),
    status: comment.status,
    resolvedBy: comment.resolvedBy,
    resolvedAt: comment.resolvedAt ? comment.resolvedAt.toISOString() : null,
    editedAt: comment.editedAt ? comment.editedAt.toISOString() : null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    canEdit: isAuthor,
    canDelete: isAuthor || canManageProject,
    canResolve: true,
  };
}

export function toPullRequestInternalReviewDto(
  review: {
    id: string;
    pullRequestId: string;
    reviewerId: string;
    decision: InternalReviewDecision;
    summary: string | null;
    commitSha: string;
    updatedAt: Date;
    reviewer: TaskUserRef | null;
  },
  currentHeadSha: string,
): PullRequestInternalReviewDto {
  return {
    id: review.id,
    pullRequestId: review.pullRequestId,
    reviewerId: review.reviewerId,
    reviewer: review.reviewer,
    decision: review.decision,
    summary: review.summary,
    commitSha: review.commitSha,
    isOutdated: Boolean(currentHeadSha && review.commitSha !== currentHeadSha),
    updatedAt: review.updatedAt.toISOString(),
  };
}

export function toLinkedPullRequestRefDto(link: {
  id: string;
  pullRequest: {
    id: string;
    number: number;
    title: string;
    state: PullRequestState;
    isDraft: boolean;
    headRef: string;
    baseRef: string;
    htmlUrl: string;
    authorLogin: string;
    githubUpdatedAt: Date;
    projectRepository: { fullName: string };
  };
}): LinkedPullRequestRefDto {
  return {
    linkId: link.id,
    pullRequestId: link.pullRequest.id,
    number: link.pullRequest.number,
    title: link.pullRequest.title,
    state: link.pullRequest.state,
    isDraft: link.pullRequest.isDraft,
    headRef: link.pullRequest.headRef,
    baseRef: link.pullRequest.baseRef,
    htmlUrl: link.pullRequest.htmlUrl,
    authorLogin: link.pullRequest.authorLogin,
    repositoryFullName: link.pullRequest.projectRepository.fullName,
    githubUpdatedAt: link.pullRequest.githubUpdatedAt.toISOString(),
  };
}

export function toPullRequestLinkedTaskDto(link: {
  id: string;
  task: {
    id: string;
    identifier: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    assignee: TaskUserRef | null;
  };
}): PullRequestLinkedTaskDto {
  return {
    linkId: link.id,
    taskId: link.task.id,
    identifier: link.task.identifier,
    title: link.task.title,
    status: link.task.status,
    priority: link.task.priority,
    assignee: link.task.assignee,
  };
}
