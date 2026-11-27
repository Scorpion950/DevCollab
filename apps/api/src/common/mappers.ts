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
