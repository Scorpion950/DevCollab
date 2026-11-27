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
  | "TASK_RESTORED";

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

export interface ProjectDetailDto extends ProjectSummaryDto {
  createdBy: { id: string; name: string | null; email: string } | null;
  members: ProjectPersonDto[];
  taskSummary?: ProjectTaskSummaryDto;
  recentTasks?: TaskSummaryDto[];
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
