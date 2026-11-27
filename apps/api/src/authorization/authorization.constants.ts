import { SetMetadata } from "@nestjs/common";
import type { OrganizationRole, ProjectRole } from "@devcollab/shared";
import type { IdentityRequest } from "../users/identity.guard";

export const ORG_ROLES_KEY = "devcollab:orgRoles";
export const PROJECT_MODE_KEY = "devcollab:projectMode";

export const RequireOrgRoles = (...roles: OrganizationRole[]) => SetMetadata(ORG_ROLES_KEY, roles);

export type ProjectAccessMode = "view" | "manage";
export const RequireProjectAccess = (mode: ProjectAccessMode) => SetMetadata(PROJECT_MODE_KEY, mode);

export interface OrgContext {
  organization: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    createdAt: Date;
  };
  membership: {
    id: string;
    role: OrganizationRole;
    status: "ACTIVE";
    joinedAt: Date;
  };
}

export interface ProjectContext {
  project: {
    id: string;
    organizationId: string;
    name: string;
    key: string;
    slug: string;
    description: string | null;
    status: "ACTIVE" | "ARCHIVED";
    createdById: string | null;
    archivedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  };
  projectRole: ProjectRole | null;
  canManage: boolean;
}

export interface ScopedRequest extends IdentityRequest {
  params: Record<string, string | undefined>;
  orgContext?: OrgContext;
  projectContext?: ProjectContext;
}
