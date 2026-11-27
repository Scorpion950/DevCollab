import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  OrganizationRole,
  ProjectDetailDto,
  ProjectManagementDashboardDto,
  ProjectRole,
  ProjectStatus,
  ProjectSummaryDto,
} from "@devcollab/shared";
import { canAssignProjectRole } from "../authorization/authorization.service";
import {
  toAuditLogEntryDto,
  toOrganizationMemberDto,
  toProjectDetailDto,
  toProjectSummaryDto,
} from "../common/mappers";
import {
  isPrismaUniqueError,
  optionalDescription,
  requireProjectKey,
  requireProjectName,
  requireProjectSlug,
} from "../common/validation";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly db: DatabaseService) {}

  async listProjects(
    orgId: string,
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    statusFilter?: string,
  ): Promise<ProjectSummaryDto[]> {
    const status: ProjectStatus | undefined =
      statusFilter === "ACTIVE" || statusFilter === "ARCHIVED" ? statusFilter : undefined;

    const projects = await this.db.prisma.project.findMany({
      where: { organizationId: orgId, ...(status ? { status } : {}) },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      include: {
        roleAssignments: {
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });

    return projects.map((project) => toProjectSummaryDto(project, actorUserId, actorOrgRole));
  }

  async createProject(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    orgId: string,
    body: {
      name?: unknown;
      key?: unknown;
      description?: unknown;
      status?: unknown;
      projectManagerId?: unknown;
    },
  ): Promise<ProjectDetailDto> {
    const name = requireProjectName(body?.name);
    const key = requireProjectKey(body?.key);
    const description = optionalDescription(body?.description, 1000);
    const status: ProjectStatus = body?.status === "ARCHIVED" ? "ARCHIVED" : "ACTIVE";
    const baseSlug = requireProjectSlug(name, key);
    const requestedManagerId =
      typeof body?.projectManagerId === "string" && body.projectManagerId.trim()
        ? body.projectManagerId.trim()
        : actorUserId;

    try {
      const project = await this.db.prisma.$transaction(async (tx) => {
        const existingKey = await tx.project.findUnique({
          where: { organizationId_key: { organizationId: orgId, key } },
          select: { id: true },
        });
        const existingSlug = await tx.project.findUnique({
          where: { organizationId_slug: { organizationId: orgId, slug: baseSlug } },
          select: { id: true },
        });
        const managerMembership = await tx.organizationMembership.findUnique({
          where: {
            organizationId_userId: { organizationId: orgId, userId: requestedManagerId },
          },
          select: { id: true, status: true },
        });

        if (existingKey) {
          throw new ConflictException(`Project key "${key}" already exists in this organization.`);
        }
        if (!managerMembership || managerMembership.status !== "ACTIVE") {
          throw new BadRequestException(
            "Selected project manager must be an active member of this organization.",
          );
        }

        const slug = existingSlug ? `${baseSlug}-${key.toLowerCase()}`.slice(0, 64) : baseSlug;
        const created = await tx.project.create({
          data: {
            organizationId: orgId,
            name,
            key,
            slug,
            description,
            status,
            archivedAt: status === "ARCHIVED" ? new Date() : null,
            createdById: actorUserId,
          },
        });

        await tx.projectRoleAssignment.create({
          data: {
            projectId: created.id,
            userId: requestedManagerId,
            role: "PROJECT_MANAGER",
            assignedById: actorUserId,
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId: created.id,
            actorId: actorUserId,
            action: "PROJECT_CREATED",
            summary: `Created project ${name} (${key})`,
          },
        });

        return tx.project.findUniqueOrThrow({
          where: { id: created.id },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            roleAssignments: {
              orderBy: [{ role: "asc" }, { createdAt: "asc" }],
              include: {
                user: { select: { id: true, name: true, email: true, image: true } },
              },
            },
          },
        });
      });

      return toProjectDetailDto(project, actorUserId, actorOrgRole);
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        throw new ConflictException("A project with this key or identifier already exists.");
      }
      throw error;
    }
  }

  async getProjectDetail(
    orgId: string,
    projectId: string,
    actorUserId: string,
    actorOrgRole: OrganizationRole,
  ): Promise<ProjectDetailDto> {
    const project = await this.db.prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        roleAssignments: {
          orderBy: [{ role: "asc" }, { createdAt: "asc" }],
          include: {
            user: { select: { id: true, name: true, email: true, image: true } },
          },
        },
      },
    });
    if (!project) {
      throw new NotFoundException("Project not found in this organization.");
    }
    return toProjectDetailDto(project, actorUserId, actorOrgRole);
  }

  async getManagementDashboard(
    orgId: string,
    projectId: string,
    actorUserId: string,
    actorOrgRole: OrganizationRole,
  ): Promise<ProjectManagementDashboardDto> {
    const [project, orgMembers, recentActivity] = await Promise.all([
      this.getProjectDetail(orgId, projectId, actorUserId, actorOrgRole),
      this.db.prisma.organizationMembership.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
      this.db.prisma.organizationAuditLog.findMany({
        where: { organizationId: orgId, projectId },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    const isOrgAdmin = actorOrgRole === "OWNER" || actorOrgRole === "ADMIN";
    return {
      project,
      orgRole: actorOrgRole,
      canEditDetails: project.canManageProject,
      canArchiveOrRestore: isOrgAdmin,
      canAssignProjectManager: isOrgAdmin,
      canAssignDeveloper: project.canManageProject,
      orgMembers: orgMembers.map(toOrganizationMemberDto),
      recentActivity: recentActivity.map(toAuditLogEntryDto),
    };
  }

  async updateProject(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    orgId: string,
    projectId: string,
    body: { name?: unknown; key?: unknown; description?: unknown },
  ): Promise<ProjectDetailDto> {
    const name = requireProjectName(body?.name);
    const description = optionalDescription(body?.description, 1000);
    const isOrgAdmin = actorOrgRole === "OWNER" || actorOrgRole === "ADMIN";

    let keyUpdate: string | undefined;
    if (body?.key !== undefined) {
      const normalized = requireProjectKey(body.key);
      keyUpdate = normalized;
    }

    try {
      const updated = await this.db.prisma.$transaction(async (tx) => {
        const existing = await tx.project.findFirst({
          where: { id: projectId, organizationId: orgId },
        });
        if (!existing) throw new NotFoundException("Project not found in this organization.");
        if (keyUpdate && keyUpdate !== existing.key && !isOrgAdmin) {
          throw new ForbiddenException("Only organization owners or admins can change a project key.");
        }

        await tx.project.update({
          where: { id: projectId },
          data: {
            name,
            description,
            ...(keyUpdate ? { key: keyUpdate } : {}),
          },
        });

        await tx.organizationAuditLog.create({
          data: {
            organizationId: orgId,
            projectId,
            actorId: actorUserId,
            action: "PROJECT_UPDATED",
            summary: `Updated settings for project ${name}`,
          },
        });

        return tx.project.findUniqueOrThrow({
          where: { id: projectId },
          include: {
            createdBy: { select: { id: true, name: true, email: true } },
            roleAssignments: {
              orderBy: [{ role: "asc" }, { createdAt: "asc" }],
              include: {
                user: { select: { id: true, name: true, email: true, image: true } },
              },
            },
          },
        });
      });

      return toProjectDetailDto(updated, actorUserId, actorOrgRole);
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        throw new ConflictException("Another project in this organization already uses that key.");
      }
      throw error;
    }
  }

  async setArchiveState(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    orgId: string,
    projectId: string,
    archive: boolean,
  ): Promise<ProjectDetailDto> {
    const project = await this.db.prisma.$transaction(async (tx) => {
      const existing = await tx.project.findFirst({
        where: { id: projectId, organizationId: orgId },
      });
      if (!existing) throw new NotFoundException("Project not found in this organization.");
      if (archive && existing.status === "ARCHIVED") {
        throw new ConflictException("This project is already archived.");
      }
      if (!archive && existing.status === "ACTIVE") {
        throw new ConflictException("This project is already active.");
      }

      await tx.project.update({
        where: { id: projectId },
        data: {
          status: archive ? "ARCHIVED" : "ACTIVE",
          archivedAt: archive ? new Date() : null,
        },
      });

      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: archive ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED",
          summary: `${archive ? "Archived" : "Restored"} project ${existing.name} (${existing.key})`,
        },
      });

      return tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      });
    });

    return toProjectDetailDto(project, actorUserId, actorOrgRole);
  }

  async assignRole(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    actorProjectRole: ProjectRole | null,
    orgId: string,
    projectId: string,
    body: { userId?: unknown; role?: unknown },
  ): Promise<ProjectDetailDto> {
    if (typeof body?.userId !== "string" || !body.userId.trim()) {
      throw new BadRequestException("Member selection is required.");
    }
    if (body?.role !== "PROJECT_MANAGER" && body?.role !== "DEVELOPER") {
      throw new BadRequestException("Project role must be PROJECT_MANAGER or DEVELOPER.");
    }
    const targetUserId = body.userId.trim();
    const targetRole: ProjectRole = body.role;

    const project = await this.db.prisma.$transaction(async (tx) => {
      const targetMembership = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId: targetUserId } },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      const existingAssignment = await tx.projectRoleAssignment.findUnique({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        select: { role: true },
      });
      const existingProject = await tx.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true, name: true },
      });

      if (!existingProject) throw new NotFoundException("Project not found in this organization.");
      if (!targetMembership || targetMembership.status !== "ACTIVE") {
        throw new BadRequestException(
          "User must be an active member of this organization to receive a project role.",
        );
      }

      if (
        !canAssignProjectRole(
          actorOrgRole,
          actorProjectRole,
          targetRole,
          existingAssignment?.role ?? null,
        )
      ) {
        throw new ForbiddenException(
          "You do not have permission to assign or change this project role.",
        );
      }

      await tx.projectRoleAssignment.upsert({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        update: { role: targetRole, assignedById: actorUserId },
        create: {
          projectId,
          userId: targetUserId,
          role: targetRole,
          assignedById: actorUserId,
        },
      });

      const label = targetMembership.user.name || targetMembership.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "PROJECT_ROLE_UPDATED",
          summary: `Assigned ${label} as ${targetRole === "PROJECT_MANAGER" ? "Project Manager" : "Developer"} on ${existingProject.name}`,
        },
      });

      return tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      });
    });

    return toProjectDetailDto(project, actorUserId, actorOrgRole);
  }

  async removeRole(
    actorUserId: string,
    actorOrgRole: OrganizationRole,
    actorProjectRole: ProjectRole | null,
    orgId: string,
    projectId: string,
    targetUserId: string,
  ): Promise<ProjectDetailDto> {
    const project = await this.db.prisma.$transaction(async (tx) => {
      const existingAssignment = await tx.projectRoleAssignment.findUnique({
        where: { projectId_userId: { projectId, userId: targetUserId } },
        include: { user: { select: { name: true, email: true } } },
      });
      const existingProject = await tx.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        select: { id: true, name: true },
      });

      if (!existingProject) throw new NotFoundException("Project not found in this organization.");
      if (!existingAssignment) {
        throw new NotFoundException("Project role assignment not found.");
      }

      const isOrgAdmin = actorOrgRole === "OWNER" || actorOrgRole === "ADMIN";
      if (
        !isOrgAdmin &&
        !(actorProjectRole === "PROJECT_MANAGER" && existingAssignment.role === "DEVELOPER")
      ) {
        throw new ForbiddenException("You cannot remove this project role assignment.");
      }

      await tx.projectRoleAssignment.delete({
        where: { id: existingAssignment.id },
      });

      const label = existingAssignment.user.name || existingAssignment.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          projectId,
          actorId: actorUserId,
          action: "PROJECT_ROLE_REMOVED",
          summary: `Removed ${label}'s project role on ${existingProject.name}`,
        },
      });

      return tx.project.findUniqueOrThrow({
        where: { id: projectId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      });
    });

    return toProjectDetailDto(project, actorUserId, actorOrgRole);
  }
}
