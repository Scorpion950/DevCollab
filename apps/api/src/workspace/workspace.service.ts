import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { ManagedProjectRef, WorkspaceBootstrap } from "@devcollab/shared";
import { toOrganizationSummary } from "../common/mappers";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  async getBootstrap(userId: string, requestedOrgId?: string): Promise<WorkspaceBootstrap> {
    const [user, memberships] = await Promise.all([
      this.db.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true },
      }),
      this.db.prisma.organizationMembership.findMany({
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
      }),
    ]);

    if (!user) throw new UnauthorizedException();

    const organizations = memberships.map(toOrganizationSummary);
    const activeOrganization =
      (requestedOrgId ? organizations.find((org) => org.id === requestedOrgId) : undefined) ??
      organizations[0] ??
      null;

    let managedProjects: ManagedProjectRef[] = [];
    if (activeOrganization) {
      const managed = await this.db.prisma.projectRoleAssignment.findMany({
        where: {
          userId,
          role: "PROJECT_MANAGER",
          project: { organizationId: activeOrganization.id },
        },
        orderBy: { project: { name: "asc" } },
        select: {
          project: { select: { id: true, name: true, key: true, slug: true } },
        },
      });
      managedProjects = managed.map((item) => item.project);
    }

    return {
      user,
      organizations,
      activeOrganization,
      managedProjectIds: managedProjects.map((project) => project.id),
      managedProjects,
    };
  }
}
