import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { RequireOrgRoles, type ScopedRequest } from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { MembershipsService } from "./memberships.service";

@Controller("organizations/:orgId")
@UseGuards(InternalIdentityGuard, OrgAccessGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get("members")
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async list(@Param("orgId") orgId: string) {
    return this.memberships.listMembers(orgId);
  }

  @Patch("members/:memberId/role")
  @RequireOrgRoles("OWNER")
  @UseGuards(WriteRateLimitGuard)
  async updateRole(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("memberId") memberId: string,
    @Body() body: { role?: unknown },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.memberships.updateRole(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      memberId,
      body?.role,
    );
  }

  @Post("transfer-ownership")
  @RequireOrgRoles("OWNER")
  @UseGuards(WriteRateLimitGuard)
  async transferOwnership(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Body() body: { targetMemberId?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.memberships.transferOwnership(request.userId, orgId, body?.targetMemberId);
  }

  @Delete("members/:memberId")
  @RequireOrgRoles("OWNER", "ADMIN")
  @UseGuards(WriteRateLimitGuard)
  async remove(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("memberId") memberId: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.memberships.removeMember(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      memberId,
    );
  }
}
