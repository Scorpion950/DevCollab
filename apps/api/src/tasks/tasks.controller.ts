import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import {
  RequireProjectAccess,
  type ScopedRequest,
} from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { ProjectAccessGuard } from "../authorization/project-access.guard";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard, type IdentityRequest } from "../users/identity.guard";
import { TasksService } from "./tasks.service";

@Controller("organizations/:orgId/projects/:projectId/tasks")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class ProjectTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async list(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Query()
    query: {
      search?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      overdue?: string;
      mine?: string;
      archived?: string;
      sort?: string;
      page?: string;
      limit?: string;
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.tasks.listProjectTasks(
      orgId,
      projectId,
      request.userId,
      request.orgContext.membership.role,
      query,
    );
  }

  @Post()
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async create(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      title?: unknown;
      description?: unknown;
      status?: unknown;
      priority?: unknown;
      assigneeId?: unknown;
      dueDate?: unknown;
      labels?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.createTask(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      body ?? {},
    );
  }

  @Get(":taskId")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.getTaskDetail(
      orgId,
      projectId,
      taskId,
      request.userId,
      request.projectContext.canManage,
    );
  }

  @Patch(":taskId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async update(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body()
    body: {
      title?: unknown;
      description?: unknown;
      status?: unknown;
      priority?: unknown;
      assigneeId?: unknown;
      dueDate?: unknown;
      labels?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.updateTask(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      body ?? {},
    );
  }

  @Post(":taskId/archive")
  @RequireProjectAccess("manage")
  @UseGuards(WriteRateLimitGuard)
  async archive(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.setArchiveState(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      true,
    );
  }

  @Post(":taskId/restore")
  @RequireProjectAccess("manage")
  @UseGuards(WriteRateLimitGuard)
  async restore(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.setArchiveState(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      false,
    );
  }

  @Get(":taskId/comments")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async listComments(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.listComments(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
    );
  }

  @Post(":taskId/comments")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async addComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body() body: { body?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.addComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      body?.body,
    );
  }

  @Patch(":taskId/comments/:commentId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async editComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Param("commentId") commentId: string,
    @Body() body: { body?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.editComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      commentId,
      body?.body,
    );
  }

  @Delete(":taskId/comments/:commentId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async deleteComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Param("commentId") commentId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.tasks.deleteComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      taskId,
      commentId,
    );
  }

  @Get(":taskId/activity")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async listActivity(
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
  ) {
    return this.tasks.listActivity(orgId, projectId, taskId);
  }
}

@Controller("tasks")
@UseGuards(InternalIdentityGuard)
export class MyTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get("mine")
  @Header("Cache-Control", "private, no-store")
  async mine(
    @Req() request: IdentityRequest,
    @Query("orgId") orgId?: string,
    @Query("scope") scope?: string,
    @Query("filter") filter?: string,
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.tasks.getMyTasks(request.userId, { orgId, scope, filter });
  }
}
