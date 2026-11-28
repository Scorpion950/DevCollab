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
  | "PR_UNLINKED"
  | "AI_RUN_STARTED"
  | "AI_PLAN_APPROVED"
  | "AI_PLAN_REJECTED"
  | "AI_PROPOSAL_READY"
  | "AI_PROPOSAL_ACCEPTED"
  | "AI_PROPOSAL_REJECTED"
  | "WORKSPACE_AI_PATCH_APPLIED"
  | "COLLAB_SESSION_STARTED"
  | "COLLAB_SESSION_CLOSED"
  | "AI_ASSISTANT_PATCH_APPLIED";

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
  canRunAi?: boolean;
  latestAgentRun?: AgentRunSummaryDto | null;
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
  canRunAi?: boolean;
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
  allowDeveloperAiRuns?: boolean;
  currentUserCanRunAi?: boolean;
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

export type AgentRunStatus =
  | "QUEUED"
  | "PLANNING"
  | "AWAITING_APPROVAL"
  | "RUNNING"
  | "AWAITING_REVIEW"
  | "COMPLETED"
  | "FAILED"
  | "REJECTED"
  | "CANCELLED";

export type AgentPlanStatus = "PENDING" | "SUPERSEDED" | "APPROVED" | "REJECTED";

export type AgentProposalStatus =
  | "PENDING_REVIEW"
  | "REVISION_REQUESTED"
  | "ACCEPTED"
  | "REJECTED"
  | "SUPERSEDED";

export type AgentTestRunStatus =
  | "PENDING"
  | "RUNNING"
  | "PASSED"
  | "FAILED"
  | "SKIPPED"
  | "UNAVAILABLE";

export type AgentRunEventType =
  | "RUN_QUEUED"
  | "CONTEXT_COLLECTED"
  | "PLAN_GENERATED"
  | "PLAN_APPROVED"
  | "PLAN_REJECTED"
  | "PLAN_REVISION_REQUESTED"
  | "EXECUTION_CLAIMED"
  | "PATCH_VALIDATED"
  | "PATCH_REJECTED"
  | "REVIEW_GENERATED"
  | "TESTS_EXECUTED"
  | "TESTS_UNAVAILABLE"
  | "PROPOSAL_CREATED"
  | "PROPOSAL_REVISION_REQUESTED"
  | "PROPOSAL_ACCEPTED"
  | "PROPOSAL_REJECTED"
  | "RUN_CANCELLED"
  | "RUN_FAILED";

export type AgentStageRole = "PLANNER" | "IMPLEMENTER" | "REVIEWER";

export interface AgentPlanStepDto {
  order: number;
  title: string;
  rationale: string;
  targetFiles: string[];
}

export interface AgentContextFileDto {
  path: string;
  bytes: number;
  truncated: boolean;
}

export interface AgentContextSummaryDto {
  repoFullName: string;
  baseBranch: string;
  baseCommitSha: string | null;
  indexedFileCount: number;
  selectedFiles: AgentContextFileDto[];
  excludedReasonSummary?: string;
}

export interface AgentPlanDto {
  id: string;
  runId: string;
  version: number;
  status: AgentPlanStatus;
  summary: string;
  steps: AgentPlanStepDto[];
  targetFiles: string[];
  risks: string[];
  suggestedChecks: string[];
  contextSummary: AgentContextSummaryDto;
  revisionFeedback: string | null;
  decidedBy: TaskUserRef | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface AgentReviewFindingDto {
  severity: "INFO" | "WARNING" | "CRITICAL";
  file: string | null;
  message: string;
}

export interface AgentProposalDto {
  id: string;
  runId: string;
  planId: string;
  version: number;
  status: AgentProposalStatus;
  summary: string;
  reviewSummary: string;
  reviewFindings: AgentReviewFindingDto[];
  changedFiles: PullRequestChangedFileDto[];
  rawPatch: string;
  filesChangedCount: number;
  additionsCount: number;
  deletionsCount: number;
  baseCommitSha: string;
  revisionFeedback: string | null;
  reviewedBy: TaskUserRef | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface AgentTestRunDto {
  id: string;
  runId: string;
  proposalId: string | null;
  status: AgentTestRunStatus;
  command: string | null;
  exitCode: number | null;
  durationMs: number | null;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  explanation: string;
  sandboxed: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface AgentRunEventDto {
  id: string;
  runId: string;
  eventType: AgentRunEventType;
  statusFrom: AgentRunStatus | null;
  statusTo: AgentRunStatus | null;
  message: string;
  metadata: Record<string, unknown> | null;
  actor: TaskUserRef | null;
  createdAt: string;
}

export interface AgentUsageRecordDto {
  id: string;
  runId: string;
  stageRole: AgentStageRole;
  provider: string;
  model: string;
  usageAvailable?: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costAvailable?: boolean;
  currency?: string;
  estimatedCostUsd: string;
  latencyMs: number;
  createdAt: string;
}

export interface AgentUsageTotalsDto {
  usageAvailable?: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costAvailable?: boolean;
  estimatedCostUsd: string;
  callCount: number;
  unreportedUsageCallCount?: number;
  unpricedCallCount?: number;
}

export interface AgentRunSummaryDto {
  id: string;
  organizationId: string;
  projectId: string;
  taskId: string;
  status: AgentRunStatus;
  requestedPhase: string;
  currentStage: string | null;
  repoFullName: string;
  baseBranch: string;
  baseCommitSha: string | null;
  taskSnapshotTitle: string;
  provider: string;
  model: string;
  triggeredBy: TaskUserRef | null;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  usageTotals: AgentUsageTotalsDto;
}

export interface AgentRunDetailDto extends AgentRunSummaryDto {
  taskIdentifier: string;
  taskTitle: string;
  taskStatus: TaskStatus;
  taskPriority: TaskPriority;
  userInstructions: string | null;
  canControlRun: boolean;
  isStaleContext: boolean;
  staleReason: string | null;
  activePlan: AgentPlanDto | null;
  plans: AgentPlanDto[];
  activeProposal: AgentProposalDto | null;
  proposals: AgentProposalDto[];
  testRuns: AgentTestRunDto[];
  events: AgentRunEventDto[];
  usageRecords: AgentUsageRecordDto[];
}

export interface AgentCapabilityStatusDto {
  projectId: string;
  taskId?: string;
  canTriggerAi: boolean;
  canApproveAi: boolean;
  canManageAiPolicy: boolean;
  allowDeveloperAiRuns: boolean;
  aiConfigured: boolean;
  provider: string | null;
  model: string | null;
  repositoryConnected: boolean;
  repoFullName: string | null;
  defaultBranch: string | null;
  sandboxEnabled: boolean;
  sandboxAvailable: boolean;
  sandboxReason: string;
  workerStatus: "ONLINE" | "IDLE" | "OFFLINE" | "UNKNOWN";
  blockingReasons: string[];
}

export interface TaskAgentWorkspaceDto {
  task: TaskDetailDto;
  capability: AgentCapabilityStatusDto;
  runs: AgentRunSummaryDto[];
  selectedRun: AgentRunDetailDto | null;
}

export interface ProjectAiOverviewDto {
  capability: AgentCapabilityStatusDto;
  runs: AgentRunSummaryDto[];
  usageSummary: AgentUsageTotalsDto;
}

export type DevWorkspaceStatus =
  | "CREATING"
  | "READY"
  | "ACTIVE"
  | "SUSPENDED"
  | "STOPPED"
  | "FAILED"
  | "EXPIRED";

export type WorkspaceStorageMode = "EPHEMERAL" | "LOCAL_VOLUME" | "DURABLE";
export type WorkspaceSnapshotStatus = "AVAILABLE" | "RESTORED" | "EXPIRED" | "MISSING";
export type WorkspaceEventType =
  | "WORKSPACE_CREATED"
  | "REPOSITORY_INITIALIZED"
  | "WORKSPACE_RESUMED"
  | "WORKSPACE_SUSPENDED"
  | "WORKSPACE_STOPPED"
  | "WORKSPACE_DELETED"
  | "WORKSPACE_FAILED"
  | "SNAPSHOT_CREATED"
  | "SNAPSHOT_RESTORED"
  | "FILE_SAVED"
  | "FILE_CREATED"
  | "FILE_RENAMED"
  | "FILE_DELETED"
  | "GIT_STAGE_CHANGED"
  | "GIT_COMMIT_CREATED"
  | "GIT_BRANCH_SWITCHED"
  | "AI_PATCH_APPLIED"
  | "TERMINAL_SESSION_STARTED"
  | "TERMINAL_SESSION_ENDED"
  | "TERMINAL_REJECTED"
  | "COLLAB_SESSION_STARTED"
  | "COLLAB_SESSION_CLOSED"
  | "COLLAB_PARTICIPANT_JOINED"
  | "COLLAB_PARTICIPANT_REVOKED"
  | "COLLAB_FILE_FLUSHED"
  | "AI_ASSISTANT_PATCH_APPLIED";

export interface WorkspaceRuntimeCapabilitiesDto {
  workerConfigured: boolean;
  workerReachable: boolean;
  workerReason: string;
  gitAvailable: boolean;
  sandboxAvailable: boolean;
  sandboxReason: string;
  terminalAvailable: boolean;
  terminalReason: string;
  storageMode: WorkspaceStorageMode;
  storageWarning: string | null;
  maxFileBytes: number;
}

export interface WorkspaceSnapshotDto {
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
  createdAt: string;
  restoredAt: string | null;
}

export interface WorkspaceEventDto {
  id: string;
  workspaceId: string;
  eventType: WorkspaceEventType;
  message: string;
  actor: TaskUserRef | null;
  createdAt: string;
}

export interface DevWorkspaceDto {
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
  lastActiveAt: string;
  suspendedAt: string | null;
  stoppedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  canWrite: boolean;
  canManage: boolean;
  canUseTerminal: boolean;
  directoryPresent: boolean;
  snapshots: WorkspaceSnapshotDto[];
  recentEvents: WorkspaceEventDto[];
}

export interface WorkspaceTreeEntryDto {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number;
  isBinary: boolean;
  children?: WorkspaceTreeEntryDto[];
}

export interface WorkspaceFileContentDto {
  path: string;
  name: string;
  content: string;
  versionHash: string;
  size: number;
  isBinary: boolean;
  isTooLarge: boolean;
  language: string;
}

export interface WorkspaceSearchMatchDto {
  path: string;
  name: string;
  lineNumber: number | null;
  preview: string | null;
}

export interface WorkspaceGitFileChangeDto {
  path: string;
  previousPath: string | null;
  stagedStatus: string | null;
  unstagedStatus: string | null;
  untracked: boolean;
}

export interface WorkspaceGitCommitDto {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authoredAt: string;
}

export interface WorkspaceGitStatusDto {
  branch: string;
  headSha: string;
  branches: string[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  files: WorkspaceGitFileChangeDto[];
  recentCommits: WorkspaceGitCommitDto[];
  remotePushAllowed: false;
}

export interface WorkspaceGitDiffDto {
  path: string | null;
  scope: "unstaged" | "staged" | "commit";
  files: PullRequestChangedFileDto[];
  rawDiff: string;
}

export interface IdeReviewableProposalDto {
  runId: string;
  taskId: string;
  taskIdentifier: string;
  taskTitle: string;
  proposal: AgentProposalDto;
}

export interface ProjectIdeOverviewDto {
  project: ProjectDetailDto;
  capabilities: WorkspaceRuntimeCapabilitiesDto;
  workspaces: DevWorkspaceDto[];
  tasks: TaskSummaryDto[];
  proposals: IdeReviewableProposalDto[];
}

export interface WorkspaceTerminalTicketDto {
  sessionId: string;
  wsUrl: string;
  token: string;
  expiresAt: string;
  sandboxed: boolean;
  explanation: string;
}

export type CollabSessionStatus = "ACTIVE" | "CLOSED";
export type CollabRole = "OWNER" | "EDITOR" | "VIEWER";
export type CollabParticipantStatus = "ACTIVE" | "LEFT" | "REMOVED";

export type CollabConnectionState =
  | "IDLE"
  | "CONNECTING"
  | "CONNECTED"
  | "RECONNECTING"
  | "OFFLINE"
  | "SYNC_DELAYED"
  | "PERMISSION_REVOKED"
  | "SESSION_CLOSED";

export interface CollabParticipantDto {
  id: string;
  sessionId: string;
  userId: string;
  user: TaskUserRef;
  role: CollabRole;
  status: CollabParticipantStatus;
  colorHex: string;
  joinedAt: string;
  leftAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
  lastSeenAt: string;
}

export interface CollabDocumentDto {
  id: string;
  sessionId: string;
  filePath: string;
  docKey: string;
  versionSeq: number;
  contentSha256: string;
  lastModifiedById: string | null;
  deletedAt: string | null;
  lastSavedAt: string;
}

export interface CollabMessageDto {
  id: string;
  sessionId: string;
  author: TaskUserRef | null;
  body: string;
  filePath: string | null;
  lineNumber: number | null;
  createdAt: string;
}

export interface CollabSessionSummaryDto {
  id: string;
  organizationId: string;
  projectId: string;
  workspaceId: string;
  workspaceName: string;
  taskId: string | null;
  taskIdentifier: string | null;
  title: string;
  status: CollabSessionStatus;
  activeFilePath: string | null;
  participantCount: number;
  myRole: CollabRole | null;
  myStatus: CollabParticipantStatus | null;
  createdBy: TaskUserRef;
  lastActivityAt: string;
  closedAt: string | null;
  createdAt: string;
}

export interface CollabSessionDetailDto extends CollabSessionSummaryDto {
  participants: CollabParticipantDto[];
  documents: CollabDocumentDto[];
  messages: CollabMessageDto[];
  eligibleInvitees: TaskUserRef[];
}

export interface CollabWsTicketDto {
  sessionId: string;
  workspaceId: string;
  role: CollabRole;
  colorHex: string;
  wsUrl: string;
  token: string;
  expiresAt: string;
  user: TaskUserRef;
}

export type AiMessageRole = "USER" | "ASSISTANT" | "SYSTEM";
export type AiInlineActionKind = "CHAT" | "EXPLAIN" | "IMPROVE" | "FIND_BUGS" | "GENERATE_TESTS";
export type AiMessageStatus = "STREAMING" | "COMPLETED" | "CANCELLED" | "FAILED";

export interface AiAssistantCitationDto {
  filePath: string;
  startLine: number | null;
  endLine: number | null;
  label: string;
}

export interface AiAssistantAttachedContextDto {
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskIdentifier: string | null;
  taskTitle: string | null;
  prId: string | null;
  prNumber: number | null;
  prTitle: string | null;
  activeFilePath: string | null;
  selection: {
    startLine: number;
    endLine: number;
    charCount: number;
  } | null;
  includedFiles: Array<{
    path: string;
    bytes: number;
    sha256: string;
    truncated: boolean;
  }>;
  includedLocalDiff: boolean;
  excludedSensitiveCount: number;
  totalContextBytes: number;
  estimatedInputTokens: number;
  truncatedReason: string | null;
}

export interface AiAssistantProposalFileDto {
  path: string;
  operation: "create" | "modify" | "delete";
  additions: number;
  deletions: number;
}

export interface AiAssistantProposalDto {
  id: string;
  summary: string;
  unifiedDiff: string;
  targetFiles: AiAssistantProposalFileDto[];
  baseFileHashes: Record<string, string | null>;
  appliedAt: string | null;
  appliedById: string | null;
  conflictReason: string | null;
}

export interface AiMessageDto {
  id: string;
  conversationId: string;
  author: TaskUserRef | null;
  role: AiMessageRole;
  actionKind: AiInlineActionKind;
  status: AiMessageStatus;
  content: string;
  errorMessage: string | null;
  attachedContext: AiAssistantAttachedContextDto | null;
  citations: AiAssistantCitationDto[];
  proposal: AiAssistantProposalDto | null;
  provider: string | null;
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationSummaryDto {
  id: string;
  organizationId: string;
  projectId: string;
  userId: string;
  workspaceId: string | null;
  taskId: string | null;
  collabSessionId: string | null;
  title: string;
  isSharedWithSession: boolean;
  lastActiveFile: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiConversationDetailDto extends AiConversationSummaryDto {
  messages: AiMessageDto[];
}

export interface AiAssistantStatusDto {
  configured: boolean;
  provider: string | null;
  model: string | null;
  canRunAi: boolean;
  reason: string;
  usageAvailable?: boolean;
  totalInputTokens: number;
  totalOutputTokens: number;
  costAvailable?: boolean;
  currency?: string;
  estimatedCostUsd: string;
}

export type AiAssistantStreamEventDto =
  | { type: "meta"; conversationId: string; userMessageId: string; assistantMessageId: string; provider: string; model: string }
  | { type: "context"; attachedContext: AiAssistantAttachedContextDto }
  | { type: "delta"; text: string }
  | { type: "done"; message: AiMessageDto }
  | { type: "error"; message: string; status?: "CANCELLED" | "FAILED" };

export type AnalyticsRangePreset = "7d" | "30d" | "90d" | "custom";
export type AnalyticsBucketGranularity = "day" | "week";
export type AnalyticsComparisonState = "VALID" | "ZERO_BASELINE" | "UNAVAILABLE";
export type AiUsageSourceKind =
  | "AGENT_PLANNER"
  | "AGENT_IMPLEMENTER"
  | "AGENT_REVIEWER"
  | "IDE_ASSISTANT";
export type AiBudgetPeriod = "WEEKLY" | "MONTHLY";

export interface AnalyticsDateFilterDto {
  preset: AnalyticsRangePreset;
  from: string;
  to: string;
  timezone: string;
  granularity: AnalyticsBucketGranularity;
  periodStartUtc: string;
  periodEndUtc: string;
  previousStartUtc: string;
  previousEndUtc: string;
}

export interface AnalyticsComparisonDto {
  current: number | null;
  previous: number | null;
  deltaPct: number | null;
  state: AnalyticsComparisonState;
}

export interface TaskStatusDistributionItemDto {
  status: TaskStatus;
  label: string;
  count: number;
}

export interface DeliveryTrendPointDto {
  bucketKey: string;
  label: string;
  createdCount: number;
  completedCount: number;
}

export interface TaskDeliveryAnalyticsDto {
  totalNonArchivedTasks: number;
  activeTasks: number;
  completedTasks: number;
  archivedTasks: number;
  overdueTasks: number;
  tasksInReview: number;
  createdInPeriod: number;
  completedInPeriod: number;
  createdComparison: AnalyticsComparisonDto;
  completedComparison: AnalyticsComparisonDto;
  statusDistribution: TaskStatusDistributionItemDto[];
  trends: DeliveryTrendPointDto[];
  archiveRuleNote: string;
}

export interface TaskLifecycleAnalyticsDto {
  throughputCount: number;
  reopenedInPeriodCount: number;
  averageCycleTimeHours: number | null;
  medianCycleTimeHours: number | null;
  cycleTimeSampleCount: number;
  cycleTimeExcludedCount: number;
  cycleTimeStatus: "AVAILABLE" | "INSUFFICIENT_DATA";
  cycleTimeRuleNote: string;
  averageLeadTimeHours: number | null;
  medianLeadTimeHours: number | null;
  leadTimeSampleCount: number;
  leadTimeStatus: "AVAILABLE" | "INSUFFICIENT_DATA";
}

export interface TaskHealthItemDto {
  id: string;
  identifier: string;
  title: string;
  projectId: string;
  projectKey: string;
  status: TaskStatus;
  dueDate: string | null;
  updatedAt: string;
}

export interface TaskHealthInsightDto {
  key: "OVERDUE" | "DUE_SOON" | "STALE_REVIEW" | "INACTIVE_ACTIVE" | "UNASSIGNED_ACTIVE";
  label: string;
  count: number;
  summary: string;
  tasks: TaskHealthItemDto[];
}

export interface GitHubAnalyticsDto {
  state: "NOT_CONNECTED" | "NOT_YET_SYNCHRONIZED" | "STALE_SYNC" | "SYNC_ERROR" | "READY";
  statusMessage: string;
  connectedRepoCount: number;
  repoFullName: string | null;
  lastSyncedAt: string | null;
  openPullRequests: number;
  draftPullRequests: number;
  mergedInPeriod: number;
  closedInPeriod: number;
  updatedRecentlyCount: number;
  githubAwaitingReviewCount: number;
  internallyApprovedCount: number;
  averageMergeTimeHours: number | null;
  mergeTimeSampleCount: number;
  reviewBoundaryNote: string;
}

export interface AiExecutionTrendPointDto {
  bucketKey: string;
  label: string;
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
}

export interface AiExecutionAnalyticsDto {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  cancelledRuns: number;
  awaitingApprovalRuns: number;
  awaitingReviewRuns: number;
  runningOrQueuedRuns: number;
  runSuccessRatePct: number | null;
  runFailureRatePct: number | null;
  averageCompletedDurationSeconds: number | null;
  durationSampleCount: number;
  plansGeneratedCount: number;
  proposalsGeneratedCount: number;
  proposalsAcceptedCount: number;
  testsExecutedCount: number;
  testsPassedCount: number;
  testsUnavailableCount: number;
  trends: AiExecutionTrendPointDto[];
  accuracyNote: string;
}

export interface AiUsageTrendPointDto {
  bucketKey: string;
  label: string;
  requestCount: number;
  reportedTokens: number | null;
  estimatedSpend: string | null;
}

export interface AiUsageGroupRowDto {
  key: string;
  label: string;
  subLabel?: string | null;
  requestCount: number;
  reportedCallCount: number;
  unreportedCallCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costedCallCount: number;
  uncostedCallCount: number;
  currency: string;
  estimatedSpend: string | null;
  costStatus: "AVAILABLE" | "PARTIAL" | "PRICING_UNAVAILABLE";
}

export interface AiRecentActivityItemDto {
  id: string;
  sourceKind: AiUsageSourceKind;
  operationLabel: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  taskId: string | null;
  taskIdentifier: string | null;
  workspaceId: string | null;
  actorName: string | null;
  provider: string;
  model: string;
  usageAvailable: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costAvailable: boolean;
  currency: string;
  estimatedCostUsd: string | null;
  statusLabel: string;
  latencyMs: number;
  createdAt: string;
}

export interface AiCurrencySpendSummaryDto {
  currency: string;
  estimatedSpend: string | null;
  costedCallCount: number;
  uncostedCallCount: number;
  status: "AVAILABLE" | "PARTIAL" | "PRICING_UNAVAILABLE";
}

export interface AiUsageAnalyticsDto {
  totalRequests: number;
  reportedCallCount: number;
  unreportedCallCount: number;
  tokenUsageStatus: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE" | "NO_USAGE";
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  totalTokens: number | null;
  mostUsedModel: string | null;
  spendByCurrency: AiCurrencySpendSummaryDto[];
  mixedCurrencyDetected: boolean;
  costStatus: "AVAILABLE" | "PARTIAL" | "PRICING_UNAVAILABLE" | "NO_USAGE";
  costStatusMessage: string;
  trends: AiUsageTrendPointDto[];
  byModel: AiUsageGroupRowDto[];
  byProject: AiUsageGroupRowDto[];
  byOperation: AiUsageGroupRowDto[];
  recentActivity: AiRecentActivityItemDto[];
  activityTotalCount: number;
  page: number;
  pageSize: number;
}

export interface AiModelPricingDto {
  id: string;
  organizationId: string;
  provider: string;
  model: string;
  version: number;
  currency: string;
  inputRatePer1m: string;
  outputRatePer1m: string;
  cachedInputRatePer1m: string | null;
  reasoningRatePer1m: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  note: string | null;
  createdAt: string;
}

export interface AiBudgetConfigDto {
  id: string;
  organizationId: string;
  projectId: string | null;
  projectName: string | null;
  projectKey: string | null;
  period: AiBudgetPeriod;
  currency: string;
  amountUsd: string;
  warningThresholdPct: number;
  hardEnforcementSupported: false;
  updatedAt: string;
}

export interface AiBudgetStatusDto {
  budget: AiBudgetConfigDto;
  windowStartUtc: string;
  windowEndUtc: string;
  consumedAmount: string | null;
  consumedPct: number | null;
  costedCallCount: number;
  uncostedCallCount: number;
  unreportedUsageCallCount: number;
  state: "OK" | "APPROACHING_BUDGET" | "BUDGET_EXCEEDED" | "PRICING_UNAVAILABLE" | "INCOMPLETE_DATA";
  warnings: string[];
}

export interface AiBudgetAuditEventDto {
  id: string;
  projectId: string | null;
  action: string;
  actor: TaskUserRef | null;
  previousValue: unknown;
  newValue: unknown;
  createdAt: string;
}

export interface OrganizationAnalyticsProjectRowDto {
  projectId: string;
  projectKey: string;
  projectName: string;
  status: ProjectStatus;
  activeTasks: number;
  completedInPeriod: number;
  overdueTasks: number;
  openPullRequests: number;
  aiRequestCount: number;
  estimatedSpendUsd: string | null;
  costStatus: "AVAILABLE" | "PARTIAL" | "PRICING_UNAVAILABLE" | "NO_USAGE";
}

export interface OrganizationAnalyticsDto {
  organizationId: string;
  organizationName: string;
  filter: AnalyticsDateFilterDto;
  generatedAtUtc: string;
  cachedHit: boolean;
  delivery: TaskDeliveryAnalyticsDto;
  github: GitHubAnalyticsDto;
  aiExecution: AiExecutionAnalyticsDto;
  aiUsage: AiUsageAnalyticsDto;
  projectBreakdown: OrganizationAnalyticsProjectRowDto[];
  budgets: AiBudgetStatusDto[];
  budgetAuditEvents: AiBudgetAuditEventDto[];
}

export interface ProjectAnalyticsDto {
  organizationId: string;
  project: ProjectDetailDto;
  canManageBudget: boolean;
  canViewUsageCosts: boolean;
  filter: AnalyticsDateFilterDto;
  generatedAtUtc: string;
  cachedHit: boolean;
  delivery: TaskDeliveryAnalyticsDto;
  lifecycle: TaskLifecycleAnalyticsDto;
  healthInsights: TaskHealthInsightDto[];
  github: GitHubAnalyticsDto;
  aiExecution: AiExecutionAnalyticsDto;
  aiUsage: AiUsageAnalyticsDto;
  budgetStatus: AiBudgetStatusDto | null;
}

export interface PersonalInsightsDto {
  userId: string;
  organizationId: string;
  organizationName: string;
  filter: AnalyticsDateFilterDto;
  generatedAtUtc: string;
  assignedActiveCount: number;
  completedInPeriodCount: number;
  overdueAssignedCount: number;
  dueSoonAssignedCount: number;
  recentTasks: TaskHealthItemDto[];
  recentActivities: Array<{
    id: string;
    taskId: string;
    taskIdentifier: string;
    projectKey: string;
    summary: string;
    createdAt: string;
  }>;
  aiUsage: AiUsageAnalyticsDto;
}
