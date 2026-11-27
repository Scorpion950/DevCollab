import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { OrganizationRole } from "@devcollab/shared";
import { ORG_ROLES_KEY, type ScopedRequest } from "./authorization.constants";
import { AuthorizationService } from "./authorization.service";

@Injectable()
export class OrgAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const roles = this.reflector.getAllAndOverride<OrganizationRole[] | undefined>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    request.orgContext = await this.authz.requireOrgMembership(
      request.userId,
      request.params?.orgId,
      roles,
    );
    return true;
  }
}
