export interface HealthResponse {
  status: "ok";
  service: "devcollab-api";
}

export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type MembershipStatus = "ACTIVE";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type ProjectRole = "PROJECT_MANAGER" | "DEVELOPER";

export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type TaskPriority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type TaskActivityType =
  | "TASK_CREATED"
  | "TITLE_UPDATED"
  | "DESCRIPTION_UPDATED"
  | "STATUS_CHANGED"
  | "PRIORITY_CHANGED"
  | "ASSIGNEE_CHANGED"
  | "DUE_DATE_CHANGED"
  | "LABELS_UPDATED"
  | "TASK_COMPLETED"
  | "TASK_REOPENED"
  | "TASK_ARCHIVED"
  | "TASK_RESTORED"
  | "PR_LINKED"
  | "PR_UNLINKED";

export type GitHubInstallationStatus = "ACTIVE" | "SUSPENDED" | "REVOKED";
export type RepositoryConnectionStatus = "CONNECTED" | "DISCONNECTED" | "ACCESS_REVOKED" | "ERROR";
export type PullRequestState = "OPEN" | "CLOSED" | "MERGED";
export type InternalReviewDecision =
  | "NONE"
  | "NEEDS_DISCUSSION"
  | "CHANGES_SUGGESTED"
  | "READY_FOR_REVIEW"
  | "INTERNALLY_APPROVED";
export type ReviewThreadStatus = "OPEN" | "RESOLVED";
export type DiffLineSide = "LEFT" | "RIGHT";

export interface LinkedPullRequestRefDto {
  linkId: string;
  pullRequestId: string;
  number: number;
  title: string;
  state: PullRequestState;
  isDraft: boolean;
  headRef: string;
  baseRef: string;
  htmlUrl: string;
  authorLogin: string;
  repositoryFullName: string;
  githubUpdatedAt: string;
}

export interface TaskUserRef {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface TaskSummaryDto {
  id: string;
  organizationId: string;
  projectId: string;
  sequenceNumber: number;
  identifier: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  dueDate: string | null;
  completedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignee: TaskUserRef | null;
  creator: TaskUserRef | null;
  commentCount: number;
}

export interface TaskCommentDto {
  id: string;
  taskId: string;
  authorId: string | null;
  body: string;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: TaskUserRef | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TaskActivityDto {
  id: string;
  taskId: string;
  projectId: string;
  actorId: string | null;
  eventType: TaskActivityType;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  summary: string;
  createdAt: string;
  actor: TaskUserRef | null;
}

export interface TaskDetailDto extends TaskSummaryDto {
  description: string | null;
  projectStatus: ProjectStatus;
  projectName: string;
  projectKey: string;
  canEditTask: boolean;
  canArchiveTask: boolean;
  comments: TaskCommentDto[];
  activities: TaskActivityDto[];
  linkedPullRequests?: LinkedPullRequestRefDto[];
}

export interface ProjectTaskSummaryDto {
  totalActive: number;
  backlog: number;
  todo: number;
  inProgress: number;
  inReview: number;
  done: number;
  overdue: number;
  unassigned: number;
  archived: number;
  priorityBreakdown: Record<TaskPriority, number>;
}

export interface ProjectTasksListResponseDto {
  project: ProjectDetailDto;
  orgMembers: OrganizationMemberDto[];
  items: TaskSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  summary: ProjectTaskSummaryDto;
}

export interface MyTaskItemDto extends TaskSummaryDto {
  projectName: string;
  projectKey: string;
  organizationName: string;
  organizationSlug: string;
}

export interface MyTasksResponseDto {
  items: MyTaskItemDto[];
  counts: {
    active: number;
    dueSoon: number;
    overdue: number;
    completed: number;
    all: number;
  };
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  role: OrganizationRole;
  status: MembershipStatus;
  memberCount: number;
  projectCount: number;
  joinedAt: string;
  createdAt: string;
}

export interface ManagedProjectRef {
  id: string;
  name: string;
  key: string;
  slug: string;
}

export interface WorkspaceBootstrap {
  user: UserSummary;
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
  managedProjectIds: string[];
  managedProjects: ManagedProjectRef[];
}

export interface OrganizationMemberDto {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: OrganizationRole;
  status: MembershipStatus;
  joinedAt: string;
}

export interface OrganizationInvitationDto {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  status: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  invitedBy: { id: string; name: string | null; email: string } | null;
}

export interface CreatedInvitationDto {
  invitation: OrganizationInvitationDto;
  token: string;
}

export type InvitationInspectState =
  | "ELIGIBLE"
  | "INVALID"
  | "EXPIRED"
  | "REVOKED"
  | "ACCEPTED"
  | "ALREADY_MEMBER"
  | "EMAIL_MISMATCH";

export interface InvitationInspectDto {
  state: InvitationInspectState;
  organizationId?: string;
  organizationName?: string;
  organizationSlug?: string;
  role?: OrganizationRole;
  expiresAt?: string;
  invitedEmailMasked?: string;
  invitedByName?: string | null;
}

export interface ProjectPersonDto {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  role: ProjectRole;
  assignedAt: string;
}

export interface ProjectSummaryDto {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  slug: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  projectManagers: ProjectPersonDto[];
  currentUserProjectRole: ProjectRole | null;
  canManageProject: boolean;
}

export interface ProjectRepositorySummaryDto {
  id: string;
  fullName: string;
  owner: string;
  name: string;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
  status: RepositoryConnectionStatus;
  openPrCount: number;
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  lastSyncError: string | null;
}

export interface ProjectDetailDto extends ProjectSummaryDto {
  createdBy: { id: string; name: string | null; email: string } | null;
  members: ProjectPersonDto[];
  taskSummary?: ProjectTaskSummaryDto;
  recentTasks?: TaskSummaryDto[];
  repositorySummary?: ProjectRepositorySummaryDto | null;
}

export interface AuditLogEntryDto {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  projectId: string | null;
  actor: { id: string; name: string | null; email: string } | null;
}

export interface OrganizationDashboardDto {
  organization: OrganizationSummary;
  stats: {
    totalMembers: number;
    totalProjects: number;
    activeProjects: number;
    archivedProjects: number;
    pendingInvitations: number;
  };
  projects: ProjectSummaryDto[];
  members: OrganizationMemberDto[];
  recentActivity: AuditLogEntryDto[];
}

export interface ProjectManagementDashboardDto {
  project: ProjectDetailDto;
  orgRole: OrganizationRole;
  canEditDetails: boolean;
  canArchiveOrRestore: boolean;
  canAssignProjectManager: boolean;
  canAssignDeveloper: boolean;
  orgMembers: OrganizationMemberDto[];
  recentActivity: AuditLogEntryDto[];
  taskSummary: ProjectTaskSummaryDto;
  recentTaskActivity: TaskActivityDto[];
}

export interface GitHubAppConfigStatusDto {
  configured: boolean;
  appSlug: string | null;
  missingFields: string[];
}

export interface GitHubInstallationDto {
  id: string;
  githubInstallationId: string;
  accountLogin: string;
  accountType: string;
  accountAvatarUrl: string | null;
  status: GitHubInstallationStatus;
  suspendedAt: string | null;
}

export interface GitHubAvailableRepoDto {
  githubRepoId: string;
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  isPrivate: boolean;
  htmlUrl: string;
}

export interface ProjectRepositoryDto extends ProjectRepositorySummaryDto {
  projectId: string;
  organizationId: string;
  githubRepoId: string;
  description: string | null;
  connectedAt: string;
  installationId: string;
  githubInstallationId: string;
  installationStatus: GitHubInstallationStatus;
  accountLogin: string;
  accountType: string;
  canManage: boolean;
}

export interface PullRequestSummaryDto {
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
  internalCommentCount: number;
  linkedTaskCount: number;
  htmlUrl: string;
  githubCreatedAt: string;
  githubUpdatedAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  lastSyncedAt: string;
}

export interface ProjectRepositoryOverviewDto {
  githubApp: GitHubAppConfigStatusDto;
  repository: ProjectRepositoryDto | null;
  installations: GitHubInstallationDto[];
  recentPullRequests: PullRequestSummaryDto[];
  counts: {
    open: number;
    draft: number;
    merged: number;
    closed: number;
  };
  canManageRepository: boolean;
}

export interface PullRequestsListResponseDto {
  githubApp: GitHubAppConfigStatusDto;
  repository: ProjectRepositoryDto | null;
  items: PullRequestSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  counts: {
    all: number;
    open: number;
    draft: number;
    merged: number;
    closed: number;
  };
}

export interface PullRequestGitHubReviewDto {
  id: string;
  authorLogin: string;
  authorAvatarUrl: string | null;
  state: string;
  submittedAt: string | null;
}

export interface PullRequestInternalReviewDto {
  id: string;
  pullRequestId: string;
  reviewerId: string;
  reviewer: TaskUserRef | null;
  decision: InternalReviewDecision;
  summary: string | null;
  commitSha: string;
  isOutdated: boolean;
  updatedAt: string;
}

export interface PullRequestReviewCommentDto {
  id: string;
  pullRequestId: string;
  authorId: string | null;
  author: TaskUserRef | null;
  body: string;
  filePath: string | null;
  lineNumber: number | null;
  lineSide: DiffLineSide | null;
  commitSha: string;
  isOutdated: boolean;
  status: ReviewThreadStatus;
  resolvedBy: TaskUserRef | null;
  resolvedAt: string | null;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
  canDelete: boolean;
  canResolve: boolean;
}

export interface PullRequestLinkedTaskDto {
  linkId: string;
  taskId: string;
  identifier: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: TaskUserRef | null;
}

export interface PullRequestDetailDto {
  repository: ProjectRepositoryDto;
  pullRequest: PullRequestSummaryDto & {
    body: string | null;
  };
  githubReviews: PullRequestGitHubReviewDto[];
  githubReviewsUnavailable: boolean;
  internalReviews: PullRequestInternalReviewDto[];
  comments: PullRequestReviewCommentDto[];
  linkedTasks: PullRequestLinkedTaskDto[];
  canReview: boolean;
  canLinkTasks: boolean;
  canManageRepository: boolean;
  canSync: boolean;
}

export interface PullRequestChangedFileDto {
  sha: string | null;
  filename: string;
  previousFilename: string | null;
  status: "added" | "removed" | "modified" | "renamed" | "copied" | "changed" | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch: string | null;
  isBinary: boolean;
  isTruncated: boolean;
  isLarge: boolean;
  lineCount: number;
  blobUrl: string | null;
}

export interface PullRequestFilesResponseDto {
  files: PullRequestChangedFileDto[];
  truncated: boolean;
  headSha: string;
  rateLimited: boolean;
  unavailableReason: string | null;
}
