import { Global, Module } from "@nestjs/common";
import { AuthorizationService } from "./authorization.service";
import { InternalServiceGuard } from "./internal-service.guard";
import { OrgAccessGuard } from "./org-access.guard";
import { ProjectAccessGuard } from "./project-access.guard";

@Global()
@Module({
  providers: [AuthorizationService, InternalServiceGuard, OrgAccessGuard, ProjectAccessGuard],
  exports: [AuthorizationService, InternalServiceGuard, OrgAccessGuard, ProjectAccessGuard],
})
export class AuthorizationModule {}
