import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
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
import { requireRequiredId } from "../common/validation";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { WorkspacesService } from "./workspaces.service";

@Controller("organizations/:orgId/projects/:projectId")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}

  @Get("ide/overview")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async overview(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.orgContext || !request.projectContext) {
      throw new UnauthorizedException();
    }
    return this.workspaces.getProjectOverview(
      request.userId,
      request.orgContext.membership.role,
      orgId,
      projectId,
      request.projectContext,
    );
  }

  @Post("workspaces")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async create(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Body() body: { name?: unknown; branch?: unknown; taskId?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.createWorkspace(
      request.userId,
      orgId,
      projectId,
      request.projectContext,
      body ?? {},
    );
  }

  @Get("workspaces/:workspaceId")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.getWorkspaceDetail(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }

  @Post("workspaces/:workspaceId/suspend")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async suspend(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.transitionLifecycle(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      "suspend",
    );
  }

  @Post("workspaces/:workspaceId/stop")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async stop(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.transitionLifecycle(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      "stop",
    );
  }

  @Post("workspaces/:workspaceId/resume")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async resume(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.transitionLifecycle(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      "resume",
    );
  }

  @Post("workspaces/:workspaceId/snapshots")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async snapshot(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.createSnapshot(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }

  @Delete("workspaces/:workspaceId")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async deleteWorkspace(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.deleteWorkspace(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }

  @Get("workspaces/:workspaceId/tree")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async tree(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.listTree(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }

  @Get("workspaces/:workspaceId/file")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async readFile(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("path") filePath?: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    if (!filePath || !filePath.trim()) {
      throw new BadRequestException("File path query parameter is required.");
    }
    return this.workspaces.readFile(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      filePath,
    );
  }

  @Put("workspaces/:workspaceId/file")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async writeFile(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { path?: unknown; content?: unknown; expectedVersionHash?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.writeFile(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body ?? {},
    );
  }

  @Post("workspaces/:workspaceId/files")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async createEntry(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { type?: unknown; path?: unknown; content?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.createEntry(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body ?? {},
    );
  }

  @Post("workspaces/:workspaceId/rename")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async renameEntry(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { oldPath?: unknown; newPath?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.renameEntry(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body ?? {},
    );
  }

  @Post("workspaces/:workspaceId/delete-entry")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async deleteEntry(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { path?: unknown; confirmNonEmpty?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.deleteEntry(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body ?? {},
    );
  }

  @Get("workspaces/:workspaceId/search")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async search(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("q") q?: string,
    @Query("mode") mode?: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.searchFiles(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      q ?? "",
      mode === "text" ? "text" : "files",
    );
  }

  @Get("workspaces/:workspaceId/git/status")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async gitStatus(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.getGitStatus(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }

  @Get("workspaces/:workspaceId/git/diff")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async gitDiff(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Query("scope") scope?: string,
    @Query("path") filePath?: string,
    @Query("sha") sha?: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const resolvedScope = scope === "staged" || scope === "commit" ? scope : "unstaged";
    return this.workspaces.getGitDiff(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      resolvedScope,
      filePath,
      sha,
    );
  }

  @Post("workspaces/:workspaceId/git/stage")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async gitStage(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { paths?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const paths = Array.isArray(body?.paths) ? body.paths.map(String) : undefined;
    return this.workspaces.stageFiles(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      paths,
    );
  }

  @Post("workspaces/:workspaceId/git/unstage")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async gitUnstage(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { paths?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    const paths = Array.isArray(body?.paths) ? body.paths.map(String) : undefined;
    return this.workspaces.unstageFiles(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      paths,
    );
  }

  @Post("workspaces/:workspaceId/git/commit")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async gitCommit(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { message?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    if (typeof body?.message !== "string") {
      throw new BadRequestException("Commit message is required.");
    }
    return this.workspaces.commitLocal(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body.message,
    );
  }

  @Post("workspaces/:workspaceId/git/branch")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async gitBranch(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { branch?: unknown; createNew?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    if (typeof body?.branch !== "string" || !body.branch.trim()) {
      throw new BadRequestException("Branch name is required.");
    }
    return this.workspaces.switchBranch(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body.branch,
      body.createNew === true,
    );
  }

  @Post("workspaces/:workspaceId/apply-proposal")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async applyProposal(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
    @Body() body: { proposalId?: unknown },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    if (typeof body?.proposalId !== "string" || !body.proposalId.trim()) {
      throw new BadRequestException("proposalId is required.");
    }
    return this.workspaces.applyAiProposal(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
      body.proposalId.trim(),
    );
  }

  @Post("workspaces/:workspaceId/terminal-session")
  @RequireProjectAccess("view")
  @UseGuards(WriteRateLimitGuard)
  async terminalSession(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("workspaceId") workspaceId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.workspaces.createTerminalSession(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(workspaceId, "Workspace"),
      request.projectContext,
    );
  }
}
