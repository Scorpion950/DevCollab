import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { RequireOrgRoles, type ScopedRequest } from "../authorization/authorization.constants";
import { InternalServiceGuard } from "../authorization/internal-service.guard";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard, type IdentityRequest } from "../users/identity.guard";
import { InvitationsService } from "./invitations.service";

@Controller("organizations/:orgId/invitations")
@UseGuards(InternalIdentityGuard, OrgAccessGuard)
export class OrgInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async list(@Param("orgId") orgId: string) {
    return this.invitations.listForOrg(orgId);
  }

  @Post()
  @RequireOrgRoles("OWNER", "ADMIN")
  @UseGuards(WriteRateLimitGuard)
  async create(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Body() body: { email?: unknown; role?: unknown },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.invitations.createInvitation(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      body ?? {},
    );
  }

  @Post(":invitationId/revoke")
  @RequireOrgRoles("OWNER", "ADMIN")
  @UseGuards(WriteRateLimitGuard)
  async revoke(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("invitationId") invitationId: string,
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.invitations.revokeInvitation(request.userId, orgId, invitationId);
  }
}

@Controller("invitations")
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post("public-inspect")
  @UseGuards(InternalServiceGuard)
  @Header("Cache-Control", "private, no-store")
  async publicInspect(@Body() body: { token?: unknown }) {
    return this.invitations.inspectPublic(body?.token);
  }

  @Post("inspect")
  @UseGuards(InternalIdentityGuard)
  @Header("Cache-Control", "private, no-store")
  async inspect(@Req() request: IdentityRequest, @Body() body: { token?: unknown }) {
    if (!request.userId) throw new UnauthorizedException();
    return this.invitations.inspectForUser(request.userId, body?.token);
  }

  @Post("accept")
  @UseGuards(InternalIdentityGuard, WriteRateLimitGuard)
  async accept(@Req() request: IdentityRequest, @Body() body: { token?: unknown }) {
    if (!request.userId) throw new UnauthorizedException();
    return this.invitations.acceptInvitation(request.userId, body?.token);
  }
}
