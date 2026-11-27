import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { OrganizationDashboardDto, OrganizationSummary } from "@devcollab/shared";
import {
  toAuditLogEntryDto,
  toOrganizationMemberDto,
  toOrganizationSummary,
  toProjectSummaryDto,
} from "../common/mappers";
import {
  isPrismaUniqueError,
  optionalDescription,
  requireOrganizationName,
  requireOrganizationSlug,
} from "../common/validation";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class OrganizationsService {
  constructor(private readonly db: DatabaseService) {}

  async listForUser(userId: string): Promise<OrganizationSummary[]> {
    const memberships = await this.db.prisma.organizationMembership.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: [{ joinedAt: "asc" }],
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            _count: { select: { memberships: true, projects: true } },
          },
        },
      },
    });
    return memberships.map(toOrganizationSummary);
  }

  async createOrganization(
    userId: string,
    body: { name?: unknown; slug?: unknown; description?: unknown },
  ): Promise<OrganizationSummary> {
    const name = requireOrganizationName(body?.name);
    const slug = requireOrganizationSlug(body?.slug, name);
    const description = optionalDescription(body?.description, 500);

    const user = await this.db.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException();

    try {
      const membership = await this.db.prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: { name, slug, description },
        });
        const createdMembership = await tx.organizationMembership.create({
          data: {
            organizationId: organization.id,
            userId,
            role: "OWNER",
            status: "ACTIVE",
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                description: true,
                createdAt: true,
                _count: { select: { memberships: true, projects: true } },
              },
            },
          },
        });
        await tx.organizationAuditLog.create({
          data: {
            organizationId: organization.id,
            actorId: userId,
            action: "ORGANIZATION_CREATED",
            summary: `Created organization ${name}`,
          },
        });
        return createdMembership;
      });

      return toOrganizationSummary(membership);
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        throw new ConflictException("An organization with this URL slug already exists.");
      }
      throw error;
    }
  }

  async getSummary(userId: string, orgId: string): Promise<OrganizationSummary> {
    const membership = await this.db.prisma.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId } },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            createdAt: true,
            _count: { select: { memberships: true, projects: true } },
          },
        },
      },
    });
    if (!membership || membership.status !== "ACTIVE") {
      throw new NotFoundException("Organization not found.");
    }
    return toOrganizationSummary(membership);
  }

  async updateOrganization(
    actorUserId: string,
    orgId: string,
    body: { name?: unknown; description?: unknown },
  ): Promise<OrganizationSummary> {
    const name = requireOrganizationName(body?.name);
    const description = optionalDescription(body?.description, 500);

    const membership = await this.db.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: orgId },
        data: { name, description },
      });
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: actorUserId,
          action: "ORGANIZATION_UPDATED",
          summary: `Updated organization settings for ${name}`,
        },
      });
      return tx.organizationMembership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              createdAt: true,
              _count: { select: { memberships: true, projects: true } },
            },
          },
        },
      });
    });

    return toOrganizationSummary(membership);
  }

  async getDashboard(actorUserId: string, orgId: string): Promise<OrganizationDashboardDto> {
    const now = new Date();
    const [membership, projects, members, pendingInvitations, recentActivity] = await Promise.all([
      this.db.prisma.organizationMembership.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: orgId, userId: actorUserId } },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
              createdAt: true,
              _count: { select: { memberships: true, projects: true } },
            },
          },
        },
      }),
      this.db.prisma.project.findMany({
        where: { organizationId: orgId },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        include: {
          roleAssignments: {
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      }),
      this.db.prisma.organizationMembership.findMany({
        where: { organizationId: orgId, status: "ACTIVE" },
        orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        include: {
          user: { select: { id: true, name: true, email: true, image: true } },
        },
      }),
      this.db.prisma.organizationInvitation.count({
        where: {
          organizationId: orgId,
          status: "PENDING",
          expiresAt: { gt: now },
        },
      }),
      this.db.prisma.organizationAuditLog.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        take: 15,
        include: {
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
    const archivedProjects = projects.filter((p) => p.status === "ARCHIVED").length;

    return {
      organization: toOrganizationSummary(membership),
      stats: {
        totalMembers: members.length,
        totalProjects: projects.length,
        activeProjects,
        archivedProjects,
        pendingInvitations,
      },
      projects: projects.map((project) =>
        toProjectSummaryDto(project, actorUserId, membership.role),
      ),
      members: members.map(toOrganizationMemberDto),
      recentActivity: recentActivity.map(toAuditLogEntryDto),
    };
  }

  async leaveOrganization(userId: string, orgId: string): Promise<{ left: true }> {
    await this.db.prisma.$transaction(async (tx) => {
      const membership = await tx.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId: orgId, userId } },
        include: { user: { select: { name: true, email: true } } },
      });
      if (!membership || membership.status !== "ACTIVE") {
        throw new NotFoundException("Membership not found.");
      }

      if (membership.role === "OWNER") {
        const ownerCount = await tx.organizationMembership.count({
          where: { organizationId: orgId, role: "OWNER", status: "ACTIVE" },
        });
        if (ownerCount <= 1) {
          throw new ConflictException(
            "You are the last Owner of this organization. Transfer ownership before leaving.",
          );
        }
      }

      await tx.projectRoleAssignment.deleteMany({
        where: { userId, project: { organizationId: orgId } },
      });
      await tx.organizationMembership.delete({
        where: { id: membership.id },
      });
      const label = membership.user.name || membership.user.email;
      await tx.organizationAuditLog.create({
        data: {
          organizationId: orgId,
          actorId: userId,
          action: "MEMBER_LEFT",
          summary: `${label} left the organization`,
        },
      });
    });

    return { left: true };
  }
}
