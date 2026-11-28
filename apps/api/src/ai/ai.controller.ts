import {
  Body,
  Controller,
  Get,
  Header,
  Param,
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
import { requireRequiredId } from "../common/validation";
import { WriteRateLimitGuard } from "../common/write-rate-limit.guard";
import { InternalIdentityGuard } from "../users/identity.guard";
import { AiRunsService } from "./ai-runs.service";

@Controller("organizations/:orgId/projects/:projectId")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class AiController {
  constructor(private readonly aiRuns: AiRunsService) {}

  @Get("ai/status")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getStatus(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Query("taskId") taskId?: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.getCapabilityStatus(
      orgId,
      projectId,
      request.projectContext,
      taskId?.trim() || undefined,
    );
  }

  @Get("ai/overview")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getOverview(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.getProjectOverview(orgId, projectId, request.projectContext);
  }

  @Get("tasks/:taskId/ai-runs")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getTaskWorkspace(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Query("runId") runId?: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.getTaskWorkspace(
      orgId,
      projectId,
      requireRequiredId(taskId, "Task"),
      request.userId,
      request.projectContext,
      runId?.trim() || undefined,
    );
  }

  @Post("tasks/:taskId/ai-runs")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async startRun(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("taskId") taskId: string,
    @Body()
    body: {
      userInstructions?: unknown;
      baseBranch?: unknown;
      idempotencyKey?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.startRun(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(taskId, "Task"),
      request.projectContext,
      body ?? {},
    );
  }

  @Get("ai/runs/:runId")
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getRunDetail(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.getRunDetail(
      orgId,
      projectId,
      requireRequiredId(runId, "AI run"),
      request.projectContext,
    );
  }

  @Post("ai/runs/:runId/plan-decision")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async decidePlan(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body()
    body: {
      decision?: unknown;
      note?: unknown;
      acknowledgeStaleContext?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.decidePlan(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(runId, "AI run"),
      request.projectContext,
      body ?? {},
    );
  }

  @Post("ai/runs/:runId/proposal-decision")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async decideProposal(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
    @Body()
    body: {
      decision?: unknown;
      note?: unknown;
    },
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.decideProposal(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(runId, "AI run"),
      request.projectContext,
      body ?? {},
    );
  }

  @Post("ai/runs/:runId/cancel")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async cancelRun(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.cancelRun(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(runId, "AI run"),
      request.projectContext,
    );
  }

  @Post("ai/runs/:runId/retry")
  @RequireProjectAccess("ai")
  @UseGuards(WriteRateLimitGuard)
  async retryRun(
    @Req() request: ScopedRequest,
    @Param("orgId") orgId: string,
    @Param("projectId") projectId: string,
    @Param("runId") runId: string,
  ) {
    if (!request.userId || !request.projectContext) throw new UnauthorizedException();
    return this.aiRuns.retryRun(
      request.userId,
      orgId,
      projectId,
      requireRequiredId(runId, "AI run"),
      request.projectContext,
    );
  }
}
