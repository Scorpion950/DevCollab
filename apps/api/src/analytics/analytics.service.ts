import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  OrganizationAnalyticsDto,
  OrganizationAnalyticsProjectRowDto,
  OrganizationRole,
  PersonalInsightsDto,
  ProjectAnalyticsDto,
  TaskHealthItemDto,
  TaskStatus,
} from "@devcollab/shared";
import type { OrgContext, ProjectContext } from "../authorization/authorization.constants";
import { AuthorizationService } from "../authorization/authorization.service";
import { toProjectDetailDto } from "../common/mappers";
import { DatabaseService } from "../database/database.service";
import { AiAnalyticsService } from "./ai-analytics.service";
import { AiPricingService } from "./ai-pricing.service";
import { AnalyticsCacheService } from "./analytics-cache.service";
import { AnalyticsExportService } from "./analytics-export.service";
import {
  parseAnalyticsDateFilter,
  type ParsedAnalyticsFilter,
} from "./date-range.util";
import { GitHubAnalyticsService } from "./github-analytics.service";
import { TaskAnalyticsService } from "./task-analytics.service";

export interface AnalyticsQueryParams {
  preset?: string;
  from?: string;
  to?: string;
  timezone?: string;
  page?: string;
  pageSize?: string;
  refresh?: string;
}

const DUE_SOON_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly auth: AuthorizationService,
    private readonly cache: AnalyticsCacheService,
    private readonly tasksAnalytics: TaskAnalyticsService,
    private readonly githubAnalytics: GitHubAnalyticsService,
    private readonly aiAnalytics: AiAnalyticsService,
    private readonly pricing: AiPricingService,
    private readonly exporter: AnalyticsExportService,
  ) {}

  private parseFilterAndPagination(query: AnalyticsQueryParams): {
    filter: ParsedAnalyticsFilter;
    page: number;
    pageSize: number;
  } {
    const filter = parseAnalyticsDateFilter({
      preset: query.preset,
      from: query.from,
      to: query.to,
      timezone: query.timezone,
    });
    const rawPage = query.page ? Number(query.page) : 1;
    const rawPageSize = query.pageSize ? Number(query.pageSize) : 15;
    if (!Number.isInteger(rawPage) || rawPage < 1 || rawPage > 1000) {
      throw new BadRequestException("page must be an integer between 1 and 1000.");
    }
    if (!Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 50) {
      throw new BadRequestException("pageSize must be an integer between 1 and 50.");
    }
    return { filter, page: rawPage, pageSize: rawPageSize };
  }

  private toPublicFilter(f: ParsedAnalyticsFilter) {
    return {
      preset: f.preset,
      from: f.from,
      to: f.to,
      timezone: f.timezone,
      granularity: f.granularity,
      periodStartUtc: f.periodStartUtc,
      periodEndUtc: f.periodEndUtc,
      previousStartUtc: f.previousStartUtc,
      previousEndUtc: f.previousEndUtc,
    };
  }

  async getOrganizationAnalytics(input: {
    orgContext: OrgContext;
    query: AnalyticsQueryParams;
  }): Promise<OrganizationAnalyticsDto> {
    const orgId = input.orgContext.organization.id;
    const role: OrganizationRole = input.orgContext.membership.role;
    if (role !== "OWNER" && role !== "ADMIN") {
      throw new ForbiddenException(
        "Organization analytics and cost reporting are restricted to organization Owners and Admins.",
      );
    }

    const { filter, page, pageSize } = this.parseFilterAndPagination(input.query);
    const cacheKey = this.cache.buildKey({
      scope: "organization",
      organizationId: orgId,
      queryParts: {
        from: filter.from,
        to: filter.to,
        timezone: filter.timezone,
        page,
        pageSize,
      },
    });
    const bypassCache = input.query.refresh === "1" || input.query.refresh === "true";
    const hit = bypassCache ? null : this.cache.get<OrganizationAnalyticsDto>(cacheKey);
    if (hit) {
      return { ...hit, cachedHit: true };
    }

    const now = new Date();
    const [
      delivery,
      github,
      aiExecution,
      aiUsage,
      projects,
      activeTaskCounts,
      completedPeriodCounts,
      overdueCounts,
      openPrCounts,
      budgetData,
    ] = await Promise.all([
      this.tasksAnalytics.getDeliveryAnalytics({
        organizationId: orgId,
        projectIds: null,
        filter,
        now,
      }),
      this.githubAnalytics.getGitHubAnalytics({
        organizationId: orgId,
        projectIds: null,
        filter,
        now,
      }),
      this.aiAnalytics.getAiExecutionAnalytics({
        organizationId: orgId,
        projectIds: null,
        filter,
      }),
      this.aiAnalytics.getAiUsageAnalytics({
        organizationId: orgId,
        projectIds: null,
        filter,
        page,
        pageSize,
        includeCostDetails: true,
      }),
      this.db.prisma.project.findMany({
        where: { organizationId: orgId },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: { id: true, key: true, name: true, status: true },
      }),
      this.db.prisma.task.groupBy({
        by: ["projectId"],
        where: { organizationId: orgId, archivedAt: null, status: { not: "DONE" } },
        _count: { _all: true },
      }),
      this.db.prisma.task.groupBy({
        by: ["projectId"],
        where: {
          organizationId: orgId,
          archivedAt: null,
          status: "DONE",
          completedAt: { gte: filter.periodStartDate, lt: filter.periodEndExclusiveDate },
        },
        _count: { _all: true },
      }),
      this.db.prisma.task.groupBy({
        by: ["projectId"],
        where: {
          organizationId: orgId,
          archivedAt: null,
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
        _count: { _all: true },
      }),
      this.db.prisma.pullRequest.groupBy({
        by: ["projectId"],
        where: {
          organizationId: orgId,
          state: "OPEN",
          projectRepository: { status: "CONNECTED" },
        },
        _count: { _all: true },
      }),
      this.pricing.listBudgetsWithStatus(orgId),
    ]);

    const toCountMap = (rows: Array<{ projectId: string; _count: { _all: number } }>) => {
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.projectId, r._count._all);
      return m;
    };

    const activeMap = toCountMap(activeTaskCounts);
    const completedMap = toCountMap(completedPeriodCounts);
    const overdueMap = toCountMap(overdueCounts);
    const openPrMap = toCountMap(openPrCounts);
    const aiByProject = new Map(aiUsage.byProject.map((p) => [p.key, p]));

    const projectBreakdown: OrganizationAnalyticsProjectRowDto[] = projects.map((p) => {
      const aiGroup = aiByProject.get(p.id);
      return {
        projectId: p.id,
        projectKey: p.key,
        projectName: p.name,
        status: p.status,
        activeTasks: activeMap.get(p.id) ?? 0,
        completedInPeriod: completedMap.get(p.id) ?? 0,
        overdueTasks: overdueMap.get(p.id) ?? 0,
        openPullRequests: openPrMap.get(p.id) ?? 0,
        aiRequestCount: aiGroup?.requestCount ?? 0,
        estimatedSpendUsd: aiGroup?.estimatedSpend ?? null,
        costStatus: aiGroup ? aiGroup.costStatus : "NO_USAGE",
      };
    });

    const payload: OrganizationAnalyticsDto = {
      organizationId: orgId,
      organizationName: input.orgContext.organization.name,
      filter: this.toPublicFilter(filter),
      generatedAtUtc: now.toISOString(),
      cachedHit: false,
      delivery,
      github,
      aiExecution,
      aiUsage,
      projectBreakdown,
      budgets: budgetData.budgets,
      budgetAuditEvents: budgetData.auditEvents,
    };

    this.cache.set({
      key: cacheKey,
      organizationId: orgId,
      payload,
    });

    return payload;
  }

  async getProjectAnalytics(input: {
    orgContext: OrgContext;
    projectContext: ProjectContext;
    actorUserId: string;
    query: AnalyticsQueryParams;
  }): Promise<ProjectAnalyticsDto> {
    const orgId = input.orgContext.organization.id;
    const orgRole = input.orgContext.membership.role;
    if (orgRole !== "OWNER" && orgRole !== "ADMIN" && !input.projectContext.projectRole) {
      throw new ForbiddenException(
        "Project analytics are restricted to assigned project members, project managers, and organization admins.",
      );
    }

    const projectId = input.projectContext.project.id;
    const canManageBudget = input.projectContext.canManage;
    const canViewUsageCosts =
      input.projectContext.canManage || input.projectContext.canRunAi;

    const { filter, page, pageSize } = this.parseFilterAndPagination(input.query);
    const cacheKey = this.cache.buildKey({
      scope: "project",
      organizationId: orgId,
      projectId,
      queryParts: {
        from: filter.from,
        to: filter.to,
        timezone: filter.timezone,
        page,
        pageSize,
        canManageBudget: canManageBudget ? 1 : 0,
        canViewUsageCosts: canViewUsageCosts ? 1 : 0,
      },
    });
    const bypassCache = input.query.refresh === "1" || input.query.refresh === "true";
    const hit = bypassCache ? null : this.cache.get<ProjectAnalyticsDto>(cacheKey);
    if (hit) {
      return { ...hit, cachedHit: true };
    }

    const now = new Date();
    const projectScope = [projectId];

    const [
      projectRow,
      delivery,
      lifecycle,
      healthInsights,
      github,
      aiExecution,
      aiUsage,
      budgetStatus,
    ] = await Promise.all([
      this.db.prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        include: {
          createdBy: { select: { id: true, name: true, email: true } },
          roleAssignments: {
            orderBy: [{ role: "asc" }, { createdAt: "asc" }],
            include: {
              user: { select: { id: true, name: true, email: true, image: true } },
            },
          },
        },
      }),
      this.tasksAnalytics.getDeliveryAnalytics({
        organizationId: orgId,
        projectIds: projectScope,
        filter,
        now,
      }),
      this.tasksAnalytics.getProjectLifecycleAnalytics({
        organizationId: orgId,
        projectId,
        filter,
      }),
      this.tasksAnalytics.getProjectHealthInsights({
        organizationId: orgId,
        projectId,
        now,
      }),
      this.githubAnalytics.getGitHubAnalytics({
        organizationId: orgId,
        projectIds: projectScope,
        filter,
        now,
      }),
      this.aiAnalytics.getAiExecutionAnalytics({
        organizationId: orgId,
        projectIds: projectScope,
        filter,
      }),
      this.aiAnalytics.getAiUsageAnalytics({
        organizationId: orgId,
        projectIds: projectScope,
        filter,
        page,
        pageSize,
        includeCostDetails: canViewUsageCosts,
      }),
      canManageBudget
        ? this.pricing.getProjectBudgetStatus(orgId, projectId)
        : Promise.resolve(null),
    ]);

    if (!projectRow) {
      throw new NotFoundException("Project not found.");
    }

    const payload: ProjectAnalyticsDto = {
      organizationId: orgId,
      project: toProjectDetailDto(
        projectRow,
        input.actorUserId,
        input.orgContext.membership.role,
      ),
      canManageBudget,
      canViewUsageCosts,
      filter: this.toPublicFilter(filter),
      generatedAtUtc: now.toISOString(),
      cachedHit: false,
      delivery,
      lifecycle,
      healthInsights,
      github,
      aiExecution,
      aiUsage,
      budgetStatus,
    };

    this.cache.set({
      key: cacheKey,
      organizationId: orgId,
      projectId,
      payload,
    });

    return payload;
  }

  private async getAccessibleProjectIdsForUser(
    organizationId: string,
    userId: string,
    orgRole: OrganizationRole,
  ): Promise<string[] | null> {
    if (orgRole === "OWNER" || orgRole === "ADMIN") {
      return null;
    }
    const assignments = await this.db.prisma.projectRoleAssignment.findMany({
      where: {
        userId,
        project: { organizationId },
      },
      select: { projectId: true },
    });
    return assignments.map((a) => a.projectId);
  }

  async getPersonalInsights(input: {
    orgContext: OrgContext;
    actorUserId: string;
    query: AnalyticsQueryParams;
  }): Promise<PersonalInsightsDto> {
    const orgId = input.orgContext.organization.id;
    const { filter, page, pageSize } = this.parseFilterAndPagination(input.query);
    const cacheKey = this.cache.buildKey({
      scope: "personal",
      organizationId: orgId,
      userId: input.actorUserId,
      queryParts: {
        from: filter.from,
        to: filter.to,
        timezone: filter.timezone,
        page,
        pageSize,
      },
    });
    const bypassCache = input.query.refresh === "1" || input.query.refresh === "true";
    const hit = bypassCache ? null : this.cache.get<PersonalInsightsDto>(cacheKey);
    if (hit) {
      return hit;
    }

    const accessibleProjectIds = await this.getAccessibleProjectIdsForUser(
      orgId,
      input.actorUserId,
      input.orgContext.membership.role,
    );

    const now = new Date();
    const dueSoonEnd = new Date(now.getTime() + DUE_SOON_MS);

    if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) {
      const emptyUsage = await this.aiAnalytics.getAiUsageAnalytics({
        organizationId: orgId,
        projectIds: [],
        userId: input.actorUserId,
        filter,
        page,
        pageSize,
        includeCostDetails: true,
      });
      return {
        userId: input.actorUserId,
        organizationId: orgId,
        organizationName: input.orgContext.organization.name,
        filter: this.toPublicFilter(filter),
        generatedAtUtc: now.toISOString(),
        assignedActiveCount: 0,
        completedInPeriodCount: 0,
        overdueAssignedCount: 0,
        dueSoonAssignedCount: 0,
        recentTasks: [],
        recentActivities: [],
        aiUsage: emptyUsage,
      };
    }

    const projectFilter =
      accessibleProjectIds !== null ? { projectId: { in: accessibleProjectIds } } : {};

    const taskBaseWhere = {
      organizationId: orgId,
      ...projectFilter,
      assigneeId: input.actorUserId,
      archivedAt: null,
    };

    const [
      assignedActiveCount,
      completedInPeriodCount,
      overdueAssignedCount,
      dueSoonAssignedCount,
      recentTaskRows,
      recentActivityRows,
      aiUsage,
    ] = await Promise.all([
      this.db.prisma.task.count({
        where: { ...taskBaseWhere, status: { not: "DONE" } },
      }),
      this.db.prisma.task.count({
        where: {
          ...taskBaseWhere,
          status: "DONE",
          completedAt: {
            gte: filter.periodStartDate,
            lt: filter.periodEndExclusiveDate,
          },
        },
      }),
      this.db.prisma.task.count({
        where: {
          ...taskBaseWhere,
          status: { not: "DONE" },
          dueDate: { lt: now },
        },
      }),
      this.db.prisma.task.count({
        where: {
          ...taskBaseWhere,
          status: { not: "DONE" },
          dueDate: { gte: now, lte: dueSoonEnd },
        },
      }),
      this.db.prisma.task.findMany({
        where: { ...taskBaseWhere, status: { not: "DONE" } },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
        take: 10,
        select: {
          id: true,
          identifier: true,
          title: true,
          projectId: true,
          status: true,
          dueDate: true,
          updatedAt: true,
          project: { select: { key: true } },
        },
      }),
      this.db.prisma.taskActivity.findMany({
        where: {
          ...projectFilter,
          createdAt: {
            gte: filter.periodStartDate,
            lt: filter.periodEndExclusiveDate,
          },
          task: { organizationId: orgId, archivedAt: null },
          OR: [
            { actorId: input.actorUserId },
            { task: { assigneeId: input.actorUserId } },
          ],
        },
        orderBy: [{ createdAt: "desc" }],
        take: 15,
        select: {
          id: true,
          taskId: true,
          summary: true,
          createdAt: true,
          task: { select: { identifier: true } },
          project: { select: { key: true } },
        },
      }),
      this.aiAnalytics.getAiUsageAnalytics({
        organizationId: orgId,
        projectIds: accessibleProjectIds,
        userId: input.actorUserId,
        filter,
        page,
        pageSize,
        includeCostDetails: true,
      }),
    ]);

    const recentTasks: TaskHealthItemDto[] = recentTaskRows.map((row) => ({
      id: row.id,
      identifier: row.identifier,
      title: row.title,
      projectId: row.projectId,
      projectKey: row.project.key,
      status: row.status as TaskStatus,
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      updatedAt: row.updatedAt.toISOString(),
    }));

    const payload: PersonalInsightsDto = {
      userId: input.actorUserId,
      organizationId: orgId,
      organizationName: input.orgContext.organization.name,
      filter: this.toPublicFilter(filter),
      generatedAtUtc: now.toISOString(),
      assignedActiveCount,
      completedInPeriodCount,
      overdueAssignedCount,
      dueSoonAssignedCount,
      recentTasks,
      recentActivities: recentActivityRows.map((a) => ({
        id: a.id,
        taskId: a.taskId,
        taskIdentifier: a.task.identifier,
        projectKey: a.project.key,
        summary: a.summary,
        createdAt: a.createdAt.toISOString(),
      })),
      aiUsage,
    };

    this.cache.set({
      key: cacheKey,
      organizationId: orgId,
      userId: input.actorUserId,
      payload,
    });

    return payload;
  }

  async exportCsv(input: {
    orgContext: OrgContext;
    actorUserId: string;
    scope?: string;
    dataset?: string;
    projectId?: string;
    query: AnalyticsQueryParams;
  }): Promise<{ filename: string; csv: string }> {
    const scope = (input.scope ?? "organization").trim();
    const dataset = (input.dataset ?? "ai-usage").trim();
    if (scope !== "organization" && scope !== "project" && scope !== "personal") {
      throw new BadRequestException(
        'Export scope must be "organization", "project", or "personal".',
      );
    }

    if (scope === "organization") {
      const data = await this.getOrganizationAnalytics({
        orgContext: input.orgContext,
        query: { ...input.query, page: "1", pageSize: "50" },
      });
      if (dataset === "delivery") {
        const csv = this.exporter.buildCsv(
          [
            "projectKey",
            "projectName",
            "status",
            "activeTasks",
            "completedInPeriod",
            "overdueTasks",
            "openPullRequests",
            "aiRequestCount",
            "estimatedSpend",
            "costStatus",
          ],
          data.projectBreakdown.map((p) => [
            p.projectKey,
            p.projectName,
            p.status,
            p.activeTasks,
            p.completedInPeriod,
            p.overdueTasks,
            p.openPullRequests,
            p.aiRequestCount,
            p.estimatedSpendUsd ?? "UNAVAILABLE",
            p.costStatus,
          ]),
        );
        return {
          filename: `devcollab-org-${data.organizationId}-summary-${data.filter.from}-to-${data.filter.to}.csv`,
          csv,
        };
      }
      const csv = this.exporter.buildCsv(
        [
          "timestampUtc",
          "projectKey",
          "projectName",
          "operation",
          "provider",
          "model",
          "taskIdentifier",
          "actor",
          "usageAvailable",
          "inputTokens",
          "outputTokens",
          "totalTokens",
          "costAvailable",
          "currency",
          "estimatedCost",
          "status",
          "latencyMs",
        ],
        data.aiUsage.recentActivity.map((item) => [
          item.createdAt,
          item.projectKey,
          item.projectName,
          item.operationLabel,
          item.provider,
          item.model,
          item.taskIdentifier ?? "",
          item.actorName ?? "",
          item.usageAvailable,
          item.inputTokens ?? "UNAVAILABLE",
          item.outputTokens ?? "UNAVAILABLE",
          item.totalTokens ?? "UNAVAILABLE",
          item.costAvailable,
          item.currency,
          item.estimatedCostUsd ?? "UNAVAILABLE",
          item.statusLabel,
          item.latencyMs,
        ]),
      );
      return {
        filename: `devcollab-org-${data.organizationId}-ai-usage-${data.filter.from}-to-${data.filter.to}.csv`,
        csv,
      };
    }

    if (scope === "project") {
      if (!input.projectId) {
        throw new BadRequestException("projectId is required for project export.");
      }
      const { orgContext, projectContext } = await this.auth.requireProjectAccess(
        input.actorUserId,
        input.orgContext.organization.id,
        input.projectId,
        "view",
        input.orgContext,
      );
      const data = await this.getProjectAnalytics({
        orgContext,
        projectContext,
        actorUserId: input.actorUserId,
        query: { ...input.query, page: "1", pageSize: "50" },
      });
      if (dataset === "delivery") {
        const csv = this.exporter.buildCsv(
          ["bucketDate", "label", "createdTasks", "completedTasks"],
          data.delivery.trends.map((t) => [
            t.bucketKey,
            t.label,
            t.createdCount,
            t.completedCount,
          ]),
        );
        return {
          filename: `devcollab-project-${data.project.key}-delivery-${data.filter.from}-to-${data.filter.to}.csv`,
          csv,
        };
      }
      const csv = this.exporter.buildCsv(
        [
          "timestampUtc",
          "operation",
          "provider",
          "model",
          "taskIdentifier",
          "actor",
          "usageAvailable",
          "inputTokens",
          "outputTokens",
          "totalTokens",
          "costAvailable",
          "currency",
          "estimatedCost",
          "status",
          "latencyMs",
        ],
        data.aiUsage.recentActivity.map((item) => [
          item.createdAt,
          item.operationLabel,
          item.provider,
          item.model,
          item.taskIdentifier ?? "",
          item.actorName ?? "",
          item.usageAvailable,
          item.inputTokens ?? "UNAVAILABLE",
          item.outputTokens ?? "UNAVAILABLE",
          item.totalTokens ?? "UNAVAILABLE",
          item.costAvailable,
          item.currency,
          data.canViewUsageCosts ? (item.estimatedCostUsd ?? "UNAVAILABLE") : "RESTRICTED",
          item.statusLabel,
          item.latencyMs,
        ]),
      );
      return {
        filename: `devcollab-project-${data.project.key}-ai-usage-${data.filter.from}-to-${data.filter.to}.csv`,
        csv,
      };
    }

    const personal = await this.getPersonalInsights({
      orgContext: input.orgContext,
      actorUserId: input.actorUserId,
      query: { ...input.query, page: "1", pageSize: "50" },
    });
    const csv = this.exporter.buildCsv(
      [
        "timestampUtc",
        "projectKey",
        "operation",
        "provider",
        "model",
        "taskIdentifier",
        "usageAvailable",
        "inputTokens",
        "outputTokens",
        "totalTokens",
        "costAvailable",
        "currency",
        "estimatedCost",
        "latencyMs",
      ],
      personal.aiUsage.recentActivity.map((item) => [
        item.createdAt,
        item.projectKey,
        item.operationLabel,
        item.provider,
        item.model,
        item.taskIdentifier ?? "",
        item.usageAvailable,
        item.inputTokens ?? "UNAVAILABLE",
        item.outputTokens ?? "UNAVAILABLE",
        item.totalTokens ?? "UNAVAILABLE",
        item.costAvailable,
        item.currency,
        item.estimatedCostUsd ?? "UNAVAILABLE",
        item.latencyMs,
      ]),
    );
    return {
      filename: `devcollab-personal-ai-usage-${personal.filter.from}-to-${personal.filter.to}.csv`,
      csv,
    };
  }
}
