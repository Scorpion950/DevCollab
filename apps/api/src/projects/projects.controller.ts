import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  RequireOrgRoles,
  RequireProjectAccess,
  type ScopedRequest,
} from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { ProjectAccessGuard } from "../authorization/project-access.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { ProjectsService } from "./projects.service";

@Controller("organizations/:orgId/projects")
@UseGuards(InternalIdentityGuard, OrgAccessGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Query("status") status?: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.listProjects(
      orgId,
      request.userId,
      request.orgContext.membership.role,
      status,
    );
  }

  @Post()
  @RequireOrgRoles("OWNER", "ADMIN")
  async create(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Body()
    body: {
      name?: unknown;
      key?: unknown;
      description?: unknown;
      status?: unknown;
      projectManagerId?: unknown;
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.createProject(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      body ?? {},
    );
  }

  @Get(":projectId")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getOne(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.getProjectDetail(
      orgId,
      projectId,
      request.userId,
      request.orgContext.membership.role,
    );
  }

  @Get(":projectId/management")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  @Header("Cache-Control", "private, no-store")
  async management(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.getManagementDashboard(
      orgId,
      projectId,
      request.userId,
      request.orgContext.membership.role,
    );
  }

  @Patch(":projectId")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  async update(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      name?: unknown;
      key?: unknown;
      description?: unknown;
      allowDeveloperAiRuns?: unknown;
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.updateProject(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      projectId,
      body ?? {},
    );
  }

  @Post(":projectId/archive")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  @RequireOrgRoles("OWNER", "ADMIN")
  async archive(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.setArchiveState(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      projectId,
      true,
    );
  }

  @Post(":projectId/restore")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  @RequireOrgRoles("OWNER", "ADMIN")
  async restore(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.projects.setArchiveState(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      projectId,
      false,
    );
  }

  @Put(":projectId/roles")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  async assignRole(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { userId?: unknown; role?: unknown; canRunAi?: unknown },
  ) {
    if (!request.userId || !request.orgContext || !request.projectContext) {
      throw new UnauthorizedException();
    }
    return this.projects.assignRole(
      request.userId,
      request.orgContext.membership.role,
      request.projectContext.projectRole,
      orgId,
      projectId,
      body ?? {},
    );
  }

  @Delete(":projectId/roles/:targetUserId")
  @UseGuards(ProjectAccessGuard)
  @RequireProjectAccess("manage")
  async removeRole(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("targetUserId") targetUserId: string,
  ) {
    if (!request.userId || !request.orgContext || !request.projectContext) {
      throw new UnauthorizedException();
    }
    return this.projects.removeRole(
      request.userId,
      request.orgContext.membership.role,
      request.projectContext.projectRole,
      orgId,
      projectId,
      targetUserId,
    );
  }
}
