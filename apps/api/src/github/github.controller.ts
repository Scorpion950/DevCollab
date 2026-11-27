import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
  type RawBodyRequest,
} from "@nestjs/common";
import {
  RequireProjectAccess,
  type ScopedRequest,
} from "../authorization/authorization.constants";
import { OrgAccessGuard } from "../authorization/org-access.guard";
import { ProjectAccessGuard } from "../authorization/project-access.guard";
import { requirePositiveIntParam, requireRequiredId } from "../common/validation";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard, type IdentityRequest } from "../users/identity.guard";
import { GitHubService } from "./github.service";

@Controller("organizations/:orgId/projects/:projectId/github")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class ProjectGitHubController {
  constructor(private readonly github: GitHubService) {}

  @Get("repository")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getOverview(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.github.getRepositoryOverview(orgId, projectId, request.projectContext.canManage);
  }

  @Get("installations")
  @RequireProjectAccess("manage")
  @Header("Cache-Control", "private, no-store")
  async listInstallations(@Param("orgId") orgId: string) {
    return this.github.listOrgInstallations(orgId);
  }

  @Post("install/start")
  @RequireProjectAccess("manage")
  @UseGuards(WriteRateLimitGuard)
  async startInstall(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.github.startInstallSession(request.userId, orgId, projectId);
  }

  @Get("installations/:installationId/repositories")
  @RequireProjectAccess("manage")
  @Header("Cache-Control", "private, no-store")
  async listRepositories(
    @Param("orgId") orgId: string,
    @Param("installationId") installationId: string,
  ) {
    return this.github.listInstallationRepositories(orgId, installationId);
  }

  @Post("connect")
  @RequireProjectAccess("manage")
  @UseGuards(WriteRateLimitGuard)
  async connectRepository(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { githubInstallationId?: unknown; githubRepoId?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.github.connectRepository(request.userId, orgId, projectId, body ?? {});
  }

  @Post("disconnect")
  @RequireProjectAccess("manage")
  @UseGuards(WriteRateLimitGuard)
  async disconnectRepository(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.github.disconnectRepository(request.userId, orgId, projectId);
  }

  @Post("sync")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async syncRepository(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.github.syncProjectRepository(orgId, projectId, request.projectContext.canManage);
  }

  @Get("pull-requests")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async listPullRequests(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Query()
    query: {
      state?: string;
      search?: string;
      sort?: string;
      page?: string;
      limit?: string;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.github.listPullRequests(
      orgId,
      projectId,
      request.projectContext.canManage,
      query,
    );
  }

  @Get("pull-requests/:prNumber")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getPullRequestDetail(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.getPullRequestDetail(
      orgId,
      projectId,
      prNumber,
      request.userId,
      request.projectContext.canManage,
    );
  }

  @Get("pull-requests/:prNumber/files")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getPullRequestFiles(
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
  ) {
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.getPullRequestFiles(orgId, projectId, prNumber);
  }

  @Post("pull-requests/:prNumber/comments")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async addReviewComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Body() body: { body?: unknown; filePath?: unknown; lineNumber?: unknown; lineSide?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.createReviewComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      prNumber,
      body ?? {},
    );
  }

  @Patch("pull-requests/:prNumber/comments/:commentId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async editReviewComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Param("commentId") commentId: string,
    @Body() body: { body?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.editReviewComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      prNumber,
      commentId,
      body?.body,
    );
  }

  @Delete("pull-requests/:prNumber/comments/:commentId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async deleteReviewComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Param("commentId") commentId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.deleteReviewComment(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      prNumber,
      commentId,
    );
  }

  @Post("pull-requests/:prNumber/comments/:commentId/resolve")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async resolveReviewComment(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Param("commentId") commentId: string,
    @Body() body: { resolved?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    const resolved = body?.resolved !== false;
    return this.github.setReviewCommentStatus(
      request.userId,
      request.projectContext.canManage,
      orgId,
      projectId,
      prNumber,
      commentId,
      resolved,
    );
  }

  @Put("pull-requests/:prNumber/internal-review")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async upsertInternalReview(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Body() body: { decision?: unknown; summary?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.upsertInternalReview(request.userId, orgId, projectId, prNumber, body ?? {});
  }

  @Post("pull-requests/:prNumber/tasks")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async linkTask(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Body() body: { taskId?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    const taskId = requireRequiredId(body?.taskId, "Task ID");
    return this.github.linkTaskAndPullRequest(request.userId, orgId, projectId, {
      taskId,
      prNumber,
    });
  }

  @Delete("pull-requests/:prNumber/tasks/:taskId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async unlinkTask(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("prNumber") prNumberRaw: string,
    @Param("taskId") taskId: string,
  ) {
    if (!request.userId) throw new UnauthorizedException();
    const prNumber = requirePositiveIntParam(prNumberRaw, "pull request number");
    return this.github.unlinkTaskAndPullRequest(request.userId, orgId, projectId, {
      taskId,
      prNumber,
    });
  }
}

@Controller("integrations/github")
export class GitHubIntegrationsController {
  constructor(private readonly github: GitHubService) {}

  @Post("callback")
  @UseGuards(InternalIdentityGuard)
  async completeCallback(
    @Req() request: IdentityRequest,
    @Body() body: { state?: unknown; installationId?: unknown; setupAction?: unknown },
  ) {
    if (!request.userId) throw new UnauthorizedException();
    return this.github.completeInstallCallback(request.userId, body ?? {});
  }

  @Post("webhooks")
  async receiveWebhook(
    @Req() request: RawBodyRequest<unknown>,
    @Headers("x-github-delivery") deliveryId?: string,
    @Headers("x-github-event") event?: string,
    @Headers("x-hub-signature-256") signature256?: string,
  ) {
    const rawBody = request.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      throw new BadRequestException("Raw webhook payload is required for signature verification.");
    }
    return this.github.processWebhook({
      deliveryId,
      event,
      signature256,
      rawBody,
    });
  }
}
