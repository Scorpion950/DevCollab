import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
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
import { AiPricingService } from "./ai-pricing.service";
import { AnalyticsService, type AnalyticsQueryParams } from "./analytics.service";

@Controller("organizations/:orgId/analytics")
@UseGuards(InternalIdentityGuard, OrgAccessGuard)
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly pricing: AiPricingService,
  ) {}

  @Get("organization")
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async getOrganizationAnalytics(
    @Req() request: ScopedRequest,
    @Query() query: AnalyticsQueryParams,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.analytics.getOrganizationAnalytics({
      orgContext: request.orgContext,
      query,
    });
  }

  @Get("personal")
  @Header("Cache-Control", "private, no-store")
  async getPersonalInsights(
    @Req() request: ScopedRequest,
    @Query() query: AnalyticsQueryParams,
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.analytics.getPersonalInsights({
      orgContext: request.orgContext,
      actorUserId: request.userId,
      query,
    });
  }

  @Get("pricing")
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async listPricing(@Req() request: ScopedRequest) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.pricing.listPricing(request.orgContext.organization.id);
  }

  @Post("pricing")
  @RequireOrgRoles("OWNER", "ADMIN")
  async createPricingVersion(
    @Req() request: ScopedRequest,
    @Body()
    body: {
      provider?: unknown;
      model?: unknown;
      currency?: unknown;
      inputRatePer1m?: unknown;
      outputRatePer1m?: unknown;
      cachedInputRatePer1m?: unknown;
      reasoningRatePer1m?: unknown;
      note?: unknown;
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.pricing.createPricingVersion({
      organizationId: request.orgContext.organization.id,
      actorUserId: request.userId,
      actorOrgRole: request.orgContext.membership.role,
      body: body ?? {},
    });
  }

  @Get("budgets")
  @RequireOrgRoles("OWNER", "ADMIN")
  @Header("Cache-Control", "private, no-store")
  async listBudgets(@Req() request: ScopedRequest) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.pricing.listBudgetsWithStatus(request.orgContext.organization.id);
  }

  @Put("budgets/organization")
  @RequireOrgRoles("OWNER", "ADMIN")
  async upsertOrganizationBudget(
    @Req() request: ScopedRequest,
    @Body()
    body: {
      period?: unknown;
      currency?: unknown;
      amountUsd?: unknown;
      warningThresholdPct?: unknown;
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    return this.pricing.upsertBudget({
      organizationId: request.orgContext.organization.id,
      projectId: null,
      actorUserId: request.userId,
      body: body ?? {},
    });
  }

  @Get("export")
  @Header("Cache-Control", "private, no-store")
  async exportCsv(
    @Req() request: ScopedRequest,
    @Query("scope") scope: string | undefined,
    @Query("dataset") dataset: string | undefined,
    @Query("projectId") projectId: string | undefined,
    @Query() query: AnalyticsQueryParams,
    @Res()
    res: {
      setHeader(name: string, value: string): void;
      status(code: number): { send(body: string): void };
    },
  ) {
    if (!request.userId || !request.orgContext) throw new UnauthorizedException();
    const { filename, csv } = await this.analytics.exportCsv({
      orgContext: request.orgContext,
      actorUserId: request.userId,
      scope,
      dataset,
      projectId,
      query,
    });
    const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}"`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.status(200).send(csv);
  }
}

@Controller("organizations/:orgId/projects/:projectId/analytics")
@UseGuards(InternalIdentityGuard, OrgAccessGuard, ProjectAccessGuard)
export class ProjectAnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly pricing: AiPricingService,
  ) {}

  @Get()
  @RequireProjectAccess("view")
  @Header("Cache-Control", "private, no-store")
  async getProjectAnalytics(
    @Req() request: ScopedRequest,
    @Query() query: AnalyticsQueryParams,
  ) {
    if (!request.userId || !request.orgContext || !request.projectContext) {
      throw new UnauthorizedException();
    }
    return this.analytics.getProjectAnalytics({
      orgContext: request.orgContext,
      projectContext: request.projectContext,
      actorUserId: request.userId,
      query,
    });
  }

  @Put("budget")
  @RequireProjectAccess("manage")
  async upsertProjectBudget(
    @Req() request: ScopedRequest,
    @Param("projectId") projectId: string,
    @Body()
    body: {
      period?: unknown;
      currency?: unknown;
      amountUsd?: unknown;
      warningThresholdPct?: unknown;
    },
  ) {
    if (!request.userId || !request.orgContext || !request.projectContext) {
      throw new UnauthorizedException();
    }
    return this.pricing.upsertBudget({
      organizationId: request.orgContext.organization.id,
      projectId,
      actorUserId: request.userId,
      body: body ?? {},
    });
  }
}
