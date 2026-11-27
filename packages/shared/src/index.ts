export interface HealthResponse {
  status: "ok";
  service: "devcollab-api";
}

export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type MembershipStatus = "ACTIVE";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
export type ProjectStatus = "ACTIVE" | "ARCHIVED";
export type ProjectRole = "PROJECT_MANAGER" | "DEVELOPER";

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
}
