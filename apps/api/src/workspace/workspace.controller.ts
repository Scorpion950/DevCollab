import { Controller, Get, Header, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { InternalIdentityGuard, type IdentityRequest } from "../users/identity.guard";
import { WorkspaceService } from "./workspace.service";

@Controller("workspace")
@UseGuards(InternalIdentityGuard)
export class WorkspaceController {
  constructor(private readonly workspace: WorkspaceService) {}

  @Get("bootstrap")
  @Header("Cache-Control", "private, no-store")
  async bootstrap(@Req() request: IdentityRequest, @Query("orgId") orgId?: string) {
    if (!request.userId) throw new UnauthorizedException();
    return this.workspace.getBootstrap(request.userId, orgId?.trim() || undefined);
  }
}
