import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PROJECT_MODE_KEY, type ProjectAccessMode, type ScopedRequest } from "./authorization.constants";
import { AuthorizationService } from "./authorization.service";

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authz: AuthorizationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const mode =
      this.reflector.getAllAndOverride<ProjectAccessMode | undefined>(PROJECT_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "view";

    const resolved = await this.authz.requireProjectAccess(
      request.userId,
      request.params?.orgId,
      request.params?.projectId,
      mode,
      request.orgContext,
    );
    request.orgContext = resolved.orgContext;
    request.projectContext = resolved.projectContext;
    return true;
  }
}
