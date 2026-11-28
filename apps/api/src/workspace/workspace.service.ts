import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { ManagedProjectRef, WorkspaceBootstrap } from "@devcollab/shared";
import { toOrganizationSummary } from "../common/mappers";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  async getBootstrap(userId: string, requestedOrgId?: string): Promise<WorkspaceBootstrap> {
    const [user, memberships, allManaged] = await Promise.all([
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
      this.db.prisma.projectRoleAssignment.findMany({
        where: { userId, role: "PROJECT_MANAGER" },
        orderBy: { project: { name: "asc" } },
        select: {
          project: {
            select: { id: true, name: true, key: true, slug: true, organizationId: true },
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

    const managedProjects: ManagedProjectRef[] = activeOrganization
      ? allManaged
          .filter((item) => item.project.organizationId === activeOrganization.id)
          .map((item) => ({
            id: item.project.id,
            name: item.project.name,
            key: item.project.key,
            slug: item.project.slug,
          }))
      : [];

    return {
      user,
      organizations,
      activeOrganization,
      managedProjectIds: managedProjects.map((project) => project.id),
      managedProjects,
    };
  }
}
