import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { OrganizationRole, ProjectRole } from "@devcollab/shared";
import { DatabaseService } from "../database/database.service";
import type { OrgContext, ProjectAccessMode, ProjectContext } from "./authorization.constants";

export function canInviteOrganizationRole(actorRole: OrganizationRole, targetRole: OrganizationRole): boolean {
  if (actorRole === "OWNER") return targetRole === "ADMIN" || targetRole === "MEMBER";
  if (actorRole === "ADMIN") return targetRole === "MEMBER";
  return false;
}

export function canChangeOrganizationRole(
  actorRole: OrganizationRole,
  targetCurrentRole: OrganizationRole,
  targetNextRole: OrganizationRole,
): boolean {
  if (actorRole !== "OWNER") return false;
  if (targetCurrentRole === "OWNER" && targetNextRole !== "OWNER") return true;
  return targetNextRole === "ADMIN" || targetNextRole === "MEMBER";
}

export function canRemoveOrganizationMember(
  actorRole: OrganizationRole,
  targetRole: OrganizationRole,
): boolean {
  if (actorRole === "OWNER") return true;
  if (actorRole === "ADMIN") return targetRole === "MEMBER";
  return false;
}

export function canAssignProjectRole(
  actorOrgRole: OrganizationRole,
  actorProjectRole: ProjectRole | null,
  targetProjectRole: ProjectRole,
  existingTargetProjectRole: ProjectRole | null,
): boolean {
  if (actorOrgRole === "OWNER" || actorOrgRole === "ADMIN") {
    return true;
  }
  if (actorProjectRole === "PROJECT_MANAGER") {
    // Project managers can manage developer assignments, not reassign or demote Project Managers.
    return targetProjectRole === "DEVELOPER" && existingTargetProjectRole !== "PROJECT_MANAGER";
  }
  return false;
}

@Injectable()
export class AuthorizationService {
  constructor(private readonly db: DatabaseService) {}

  async requireOrgMembership(
    userId: string | undefined,
    organizationId: string | undefined,
    allowedRoles?: OrganizationRole[],
  ): Promise<OrgContext> {
    if (!userId) throw new UnauthorizedException();
    if (!organizationId || !organizationId.trim()) {
      throw new ForbiddenException("Organization context is required.");
    }

    const membership = await this.db.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: { organizationId, userId },
      },
      include: {
        organization: {
          select: { id: true, name: true, slug: true, description: true, createdAt: true },
        },
      },
    });

    if (!membership || membership.status !== "ACTIVE") {
      throw new ForbiddenException("You do not have access to this organization.");
    }

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException("Your organization role does not permit this action.");
    }

    return {
      organization: membership.organization,
      membership: {
        id: membership.id,
        role: membership.role,
        status: membership.status,
        joinedAt: membership.joinedAt,
      },
    };
  }

  async requireProjectAccess(
    userId: string | undefined,
    organizationId: string | undefined,
    projectId: string | undefined,
    mode: ProjectAccessMode,
    existingOrgContext?: OrgContext,
  ): Promise<{ orgContext: OrgContext; projectContext: ProjectContext }> {
    if (!userId) throw new UnauthorizedException();
    const orgContext =
      existingOrgContext ?? (await this.requireOrgMembership(userId, organizationId));

    if (!projectId || !projectId.trim()) {
      throw new NotFoundException("Project not found.");
    }

    const [project, assignment] = await Promise.all([
      this.db.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgContext.organization.id },
        select: {
          id: true,
          organizationId: true,
          name: true,
          key: true,
          slug: true,
          description: true,
          status: true,
          createdById: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.db.prisma.projectRoleAssignment.findUnique({
        where: { projectId_userId: { projectId, userId } },
        select: { role: true },
      }),
    ]);

    if (!project) {
      throw new NotFoundException("Project not found in this organization.");
    }

    const projectRole = assignment?.role ?? null;
    const canManage =
      orgContext.membership.role === "OWNER" ||
      orgContext.membership.role === "ADMIN" ||
      projectRole === "PROJECT_MANAGER";

    if (mode === "manage" && !canManage) {
      throw new ForbiddenException(
        "Only organization owners, admins, or assigned project managers can access project management.",
      );
    }

    return {
      orgContext,
      projectContext: {
        project,
        projectRole,
        canManage,
      },
    };
  }
}
