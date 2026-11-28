import {
  Body,
  Controller,
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
import { OrganizationsService } from "./organizations.service";

@Controller("organizations")
@UseGuards(InternalIdentityGuard)
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(@Req() request: ScopedRequest) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.listForUser(request.userId);
  }

  @Post()
  @UseGuards(WriteRateLimitGuard)
  async create(
    @Req() request: ScopedRequest,
    @Body() body: { name?: unknown; slug?: unknown; description?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.createOrganization(request.userId, body ?? {});
  }

  @Get(":orgId")
  @UseGuards(OrgAccessGuard)
  @Header("Cache-Control", "private, no-store")
  async getOne(@Req() request: ScopedRequest, @Param("orgId") orgId: string) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.getSummary(request.userId, orgId);
  }

  @Patch(":orgId")
  @UseGuards(OrgAccessGuard, WriteRateLimitGuard)
  @RequireOrgRoles("OWNER", "ADMIN")
  async update(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Body() body: { name?: unknown; description?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.updateOrganization(request.userId, orgId, body ?? {});
  }

  @Get(":orgId/dashboard")
  @UseGuards(OrgAccessGuard)
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async dashboard(@Req() request: ScopedRequest, @Param("orgId") orgId: string) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.getDashboard(request.userId, orgId);
  }

  @Post(":orgId/leave")
  @UseGuards(OrgAccessGuard, WriteRateLimitGuard)
  async leave(@Req() request: ScopedRequest, @Param("orgId") orgId: string) {
    if (!request.userId) throw new UnauthorizedException();
    return this.organizations.leaveOrganization(request.userId, orgId);
  }
}
