const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Reflector } = require("@nestjs/core");
const { BadRequestException, ForbiddenException } = require("@nestjs/common");

const {
  AiProviderClient,
  computeUsageCostFromPricing,
} = require("@devcollab/ai-core");
const {
  parseAnalyticsDateFilter,
  computeComparison,
} = require("../dist/analytics/date-range.util");
const {
  neutralizeCsvCell,
  AnalyticsExportService,
} = require("../dist/analytics/analytics-export.service");
const { AnalyticsCacheService } = require("../dist/analytics/analytics-cache.service");
const { AiPricingService } = require("../dist/analytics/ai-pricing.service");
const { TaskAnalyticsService } = require("../dist/analytics/task-analytics.service");
const { GitHubAnalyticsService } = require("../dist/analytics/github-analytics.service");
const { AiAnalyticsService } = require("../dist/analytics/ai-analytics.service");
const { AnalyticsService } = require("../dist/analytics/analytics.service");
const {
  AnalyticsController,
  ProjectAnalyticsController,
} = require("../dist/analytics/analytics.controller");
const {
  ORG_ROLES_KEY,
  PROJECT_MODE_KEY,
} = require("../dist/authorization/authorization.constants");

function decimalObj(val) {
  return {
    toString() {
      return String(val);
    },
  };
}

function createAnalyticsFixture() {
  let seq = 1;
  const id = (p) => `${p}_${seq++}`;

  const state = {
    users: new Map([
      ["u_owner", { id: "u_owner", name: "Owner User", email: "owner@acme.dev", image: null }],
      ["u_pm", { id: "u_pm", name: "PM User", email: "pm@acme.dev", image: null }],
      ["u_dev", { id: "u_dev", name: "Dev User", email: "dev@acme.dev", image: null }],
      ["u_colleague", { id: "u_colleague", name: "Colleague", email: "col@acme.dev", image: null }],
      ["u_other_org", { id: "u_other_org", name: "Other Org", email: "other@beta.dev", image: null }],
    ]),
    orgs: new Map([
      ["org_1", { id: "org_1", name: "Acme Corp", slug: "acme", description: null, createdAt: new Date("2026-01-01T00:00:00Z") }],
      ["org_2", { id: "org_2", name: "Beta Corp", slug: "beta", description: null, createdAt: new Date("2026-01-01T00:00:00Z") }],
    ]),
    memberships: [
      { id: "m1", organizationId: "org_1", userId: "u_owner", role: "OWNER", status: "ACTIVE", joinedAt: new Date("2026-01-01T00:00:00Z") },
      { id: "m2", organizationId: "org_1", userId: "u_pm", role: "MEMBER", status: "ACTIVE", joinedAt: new Date("2026-01-02T00:00:00Z") },
      { id: "m3", organizationId: "org_1", userId: "u_dev", role: "MEMBER", status: "ACTIVE", joinedAt: new Date("2026-01-03T00:00:00Z") },
      { id: "m4", organizationId: "org_1", userId: "u_colleague", role: "MEMBER", status: "ACTIVE", joinedAt: new Date("2026-01-04T00:00:00Z") },
      { id: "m5", organizationId: "org_2", userId: "u_other_org", role: "OWNER", status: "ACTIVE", joinedAt: new Date("2026-01-01T00:00:00Z") },
    ],
    projects: new Map([
      [
        "proj_1",
        {
          id: "proj_1",
          organizationId: "org_1",
          name: "Core Platform",
          key: "CORE",
          slug: "core-platform",
          description: "Main platform",
          status: "ACTIVE",
          allowDeveloperAiRuns: true,
          createdById: "u_owner",
          createdBy: { id: "u_owner", name: "Owner User", email: "owner@acme.dev" },
          archivedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-11-20T00:00:00Z"),
        },
      ],
      [
        "proj_2",
        {
          id: "proj_2",
          organizationId: "org_1",
          name: "Secret R&D",
          key: "SEC",
          slug: "secret-rd",
          description: "Restricted project",
          status: "ACTIVE",
          allowDeveloperAiRuns: false,
          createdById: "u_owner",
          createdBy: { id: "u_owner", name: "Owner User", email: "owner@acme.dev" },
          archivedAt: null,
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-11-20T00:00:00Z"),
        },
      ],
    ]),
    roleAssignments: [
      { id: "ra1", projectId: "proj_1", userId: "u_pm", role: "PROJECT_MANAGER", canRunAi: true, createdAt: new Date("2026-01-05T00:00:00Z") },
      { id: "ra2", projectId: "proj_1", userId: "u_dev", role: "DEVELOPER", canRunAi: true, createdAt: new Date("2026-01-05T00:00:00Z") },
      { id: "ra3", projectId: "proj_2", userId: "u_colleague", role: "PROJECT_MANAGER", canRunAi: true, createdAt: new Date("2026-01-05T00:00:00Z") },
    ],
    tasks: [],
    taskActivities: [],
    repos: [],
    prs: [],
    prInternalReviews: [],
    agentRuns: [],
    agentPlans: [],
    agentProposals: [],
    agentTestRuns: [],
    agentUsageRecords: [],
    aiConversations: [],
    aiAssistantUsageRecords: [],
    aiModelPricings: [],
    aiBudgetConfigs: [],
    aiBudgetAuditEvents: [],
    auditLogs: [],
  };

  function matchSimple(row, where = {}) {
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "AND") {
        if (!v.every((clause) => matchSimple(row, clause))) return false;
        continue;
      }
      if (k === "OR") {
        if (!v.some((clause) => matchSimple(row, clause))) return false;
        continue;
      }
      if (k === "NOT") {
        if (matchSimple(row, v)) return false;
        continue;
      }
      if (k === "project") {
        const proj = state.projects.get(row.projectId);
        if (!proj || !matchSimple(proj, v)) return false;
        continue;
      }
      if (k === "task") {
        const t = state.tasks.find((x) => x.id === row.taskId);
        if (!t || !matchSimple(t, v)) return false;
        continue;
      }
      if (k === "run") {
        const run = state.agentRuns.find((x) => x.id === row.runId);
        if (!run || !matchSimple(run, v)) return false;
        continue;
      }
      if (k === "projectRepository") {
        const repo = state.repos.find((x) => x.id === row.projectRepositoryId);
        if (!repo || !matchSimple(repo, v)) return false;
        continue;
      }
      if (k === "pullRequest") {
        const pr = state.prs.find((x) => x.id === row.pullRequestId);
        if (!pr || !matchSimple(pr, v)) return false;
        continue;
      }
      const val = row[k];
      if (v && typeof v === "object" && !(v instanceof Date) && !Array.isArray(v)) {
        if ("in" in v) {
          if (!v.in.includes(val)) return false;
        } else if ("not" in v) {
          if (v.not === null) {
            if (val === null || val === undefined) return false;
          } else if (val === v.not) return false;
        } else {
          if ("gte" in v && (!(val instanceof Date) || val.getTime() < v.gte.getTime())) return false;
          if ("lte" in v && (!(val instanceof Date) || val.getTime() > v.lte.getTime())) return false;
          if ("lt" in v && (!(val instanceof Date) || val.getTime() >= v.lt.getTime())) return false;
          if ("gt" in v && (!(val instanceof Date) || val.getTime() <= v.gt.getTime())) return false;
        }
        continue;
      }
      if (val !== v) return false;
    }
    return true;
  }

  const prisma = {
    organizationMembership: {
      findUnique: async ({ where }) => {
        const key = where.organizationId_userId;
        const m = state.memberships.find(
          (x) => x.organizationId === key.organizationId && x.userId === key.userId,
        );
        if (!m) return null;
        return { ...m, organization: state.orgs.get(m.organizationId) };
      },
    },
    project: {
      findFirst: async ({ where }) => {
        const p = [...state.projects.values()].find((x) => matchSimple(x, where));
        if (!p) return null;
        return {
          ...p,
          roleAssignments: state.roleAssignments
            .filter((ra) => ra.projectId === p.id)
            .map((ra) => ({ ...ra, user: state.users.get(ra.userId) })),
        };
      },
      findMany: async ({ where }) => {
        return [...state.projects.values()].filter((x) => matchSimple(x, where));
      },
    },
    projectRoleAssignment: {
      findUnique: async ({ where }) => {
        const k = where.projectId_userId;
        return (
          state.roleAssignments.find(
            (ra) => ra.projectId === k.projectId && ra.userId === k.userId,
          ) ?? null
        );
      },
      findMany: async ({ where }) => {
        return state.roleAssignments.filter((ra) => matchSimple(ra, where));
      },
    },
    task: {
      groupBy: async ({ by, where }) => {
        const field = by[0];
        const rows = state.tasks.filter((t) => matchSimple(t, where));
        const counts = new Map();
        for (const r of rows) counts.set(r[field], (counts.get(r[field]) ?? 0) + 1);
        return [...counts.entries()].map(([k, count]) => ({ [field]: k, _count: { _all: count } }));
      },
      count: async ({ where }) => state.tasks.filter((t) => matchSimple(t, where)).length,
      findMany: async ({ where, orderBy, take }) => {
        let rows = state.tasks.filter((t) => matchSimple(t, where));
        if (orderBy) {
          rows = [...rows].sort((a, b) => a.createdAt - b.createdAt);
        }
        if (take) rows = rows.slice(0, take);
        return rows.map((t) => ({ ...t, project: state.projects.get(t.projectId) }));
      },
    },
    taskActivity: {
      count: async ({ where }) => state.taskActivities.filter((a) => matchSimple(a, where)).length,
      findMany: async ({ where, take }) => {
        let rows = state.taskActivities
          .filter((a) => matchSimple(a, where))
          .sort((a, b) => a.createdAt - b.createdAt);
        if (take) rows = rows.slice(0, take);
        return rows.map((a) => ({
          ...a,
          task: state.tasks.find((t) => t.id === a.taskId),
          project: state.projects.get(a.projectId),
        }));
      },
    },
    projectRepository: {
      findMany: async ({ where }) => state.repos.filter((r) => matchSimple(r, where)),
    },
    pullRequest: {
      count: async ({ where }) => state.prs.filter((p) => matchSimple(p, where)).length,
      groupBy: async ({ by, where }) => {
        const field = by[0];
        const rows = state.prs.filter((p) => matchSimple(p, where));
        const counts = new Map();
        for (const r of rows) counts.set(r[field], (counts.get(r[field]) ?? 0) + 1);
        return [...counts.entries()].map(([k, count]) => ({ [field]: k, _count: { _all: count } }));
      },
      findMany: async ({ where }) => state.prs.filter((p) => matchSimple(p, where)),
    },
    pullRequestInternalReview: {
      count: async ({ where }) => state.prInternalReviews.filter((r) => matchSimple(r, where)).length,
    },
    agentRun: {
      findMany: async ({ where }) => state.agentRuns.filter((r) => matchSimple(r, where)),
    },
    agentPlan: {
      count: async ({ where }) => state.agentPlans.filter((p) => matchSimple(p, where)).length,
    },
    agentProposal: {
      findMany: async ({ where }) => state.agentProposals.filter((p) => matchSimple(p, where)),
    },
    agentTestRun: {
      findMany: async ({ where }) => state.agentTestRuns.filter((t) => matchSimple(t, where)),
    },
    agentUsageRecord: {
      findMany: async ({ where }) =>
        state.agentUsageRecords
          .filter((u) => matchSimple(u, where))
          .map((u) => ({
            ...u,
            project: state.projects.get(u.projectId),
            user: u.userId ? state.users.get(u.userId) ?? null : null,
            run: (() => {
              const run = state.agentRuns.find((r) => r.id === u.runId);
              return {
                ...run,
                task: state.tasks.find((t) => t.id === run?.taskId) ?? null,
                triggeredBy: run?.triggeredById ? state.users.get(run.triggeredById) ?? null : null,
              };
            })(),
          })),
    },
    aiAssistantUsageRecord: {
      findMany: async ({ where }) =>
        state.aiAssistantUsageRecords
          .filter((u) => matchSimple(u, where))
          .map((u) => ({
            ...u,
            project: state.projects.get(u.projectId),
            user: u.userId ? state.users.get(u.userId) ?? null : null,
            conversation: state.aiConversations.find((c) => c.id === u.conversationId) ?? {
              workspaceId: null,
              taskId: null,
              task: null,
            },
          })),
    },
    aiModelPricing: {
      findMany: async ({ where }) =>
        state.aiModelPricings
          .filter((p) => matchSimple(p, where))
          .sort((a, b) => b.version - a.version),
      findFirst: async ({ where }) => {
        const matches = state.aiModelPricings
          .filter((p) => matchSimple(p, where))
          .sort((a, b) => b.version - a.version);
        return matches[0] ?? null;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const p of state.aiModelPricings) {
          if (matchSimple(p, where)) {
            Object.assign(p, data);
            count += 1;
          }
        }
        return { count };
      },
      create: async ({ data }) => {
        const row = {
          id: id("price"),
          ...data,
          inputRatePer1m: decimalObj(data.inputRatePer1m),
          outputRatePer1m: decimalObj(data.outputRatePer1m),
          cachedInputRatePer1m: data.cachedInputRatePer1m ? decimalObj(data.cachedInputRatePer1m) : null,
          reasoningRatePer1m: data.reasoningRatePer1m ? decimalObj(data.reasoningRatePer1m) : null,
          effectiveTo: null,
          createdAt: new Date(),
        };
        state.aiModelPricings.push(row);
        return row;
      },
    },
    aiBudgetConfig: {
      findMany: async ({ where }) =>
        state.aiBudgetConfigs
          .filter((b) => matchSimple(b, where))
          .map((b) => ({ ...b, project: b.projectId ? state.projects.get(b.projectId) ?? null : null })),
      findFirst: async ({ where }) => {
        const b = state.aiBudgetConfigs.find((x) => matchSimple(x, where));
        if (!b) return null;
        return { ...b, project: b.projectId ? state.projects.get(b.projectId) ?? null : null };
      },
      findUnique: async ({ where }) =>
        state.aiBudgetConfigs.find((x) => x.scopeKey === where.scopeKey) ?? null,
      create: async ({ data }) => {
        const row = {
          id: id("budget"),
          ...data,
          amountUsd: decimalObj(data.amountUsd),
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.aiBudgetConfigs.push(row);
        return { ...row, project: row.projectId ? state.projects.get(row.projectId) ?? null : null };
      },
      update: async ({ where, data }) => {
        const row = state.aiBudgetConfigs.find((x) => x.scopeKey === where.scopeKey);
        Object.assign(row, data, { amountUsd: decimalObj(data.amountUsd), updatedAt: new Date() });
        return { ...row, project: row.projectId ? state.projects.get(row.projectId) ?? null : null };
      },
    },
    aiBudgetAuditEvent: {
      findMany: async ({ where }) =>
        state.aiBudgetAuditEvents
          .filter((a) => matchSimple(a, where))
          .sort((a, b) => b.createdAt - a.createdAt)
          .map((a) => ({ ...a, actor: a.actorId ? state.users.get(a.actorId) ?? null : null })),
      create: async ({ data }) => {
        const row = { id: id("baud"), ...data, createdAt: new Date() };
        state.aiBudgetAuditEvents.push(row);
        return row;
      },
    },
    organizationAuditLog: {
      create: async ({ data }) => {
        const row = { id: id("audit"), ...data, createdAt: new Date() };
        state.auditLogs.push(row);
        return row;
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const db = { prisma };
  const { AuthorizationService } = require("../dist/authorization/authorization.service");
  const auth = new AuthorizationService(db);
  const cache = new AnalyticsCacheService();
  const exporter = new AnalyticsExportService();
  const pricing = new AiPricingService(db, cache);
  const tasksAnalytics = new TaskAnalyticsService(db);
  const githubAnalytics = new GitHubAnalyticsService(db);
  const aiAnalytics = new AiAnalyticsService(db);
  const analytics = new AnalyticsService(
    db,
    auth,
    cache,
    tasksAnalytics,
    githubAnalytics,
    aiAnalytics,
    pricing,
    exporter,
  );

  return { state, db, auth, cache, pricing, analytics, exporter };
}

test("Date range validation, timezone UTC boundaries, and honest baseline comparisons", () => {
  assert.throws(
    () => parseAnalyticsDateFilter({ preset: "custom", from: "2026-11-10", to: "2026-11-01" }),
    BadRequestException,
  );
  assert.throws(
    () => parseAnalyticsDateFilter({ preset: "custom", from: "2025-01-01", to: "2026-11-01" }),
    BadRequestException,
  );
  assert.throws(
    () => parseAnalyticsDateFilter({ preset: "7d", timezone: "Mars/Olympus" }),
    BadRequestException,
  );

  // EST (UTC-5 in November): 2026-11-15 00:00 EST == 2026-11-15T05:00:00Z
  const nyFilter = parseAnalyticsDateFilter({
    preset: "custom",
    from: "2026-11-15",
    to: "2026-11-15",
    timezone: "America/New_York",
  });
  assert.equal(nyFilter.periodStartUtc, "2026-11-15T05:00:00.000Z");
  assert.equal(nyFilter.periodEndUtc, "2026-11-16T04:59:59.999Z");

  assert.deepEqual(computeComparison(10, 0), {
    current: 10,
    previous: 0,
    deltaPct: null,
    state: "ZERO_BASELINE",
  });
  assert.deepEqual(computeComparison(15, 10), {
    current: 15,
    previous: 10,
    deltaPct: 50,
    state: "VALID",
  });
});

test("Task delivery counts exclude archived tasks, respect reopened state, and never invent cycle time without In Progress transitions", async () => {
  const { state, analytics, auth } = createAnalyticsFixture();
  const orgCtx = await auth.requireOrgMembership("u_owner", "org_1");
  const { projectContext } = await auth.requireProjectAccess("u_owner", "org_1", "proj_1", "view", orgCtx);

  state.tasks.push(
    // Completed WITH In Progress history -> 10.0 hours cycle time, 24.0 hours lead time
    {
      id: "t1",
      organizationId: "org_1",
      projectId: "proj_1",
      identifier: "CORE-1",
      title: "Valid cycle task",
      status: "DONE",
      assigneeId: "u_dev",
      dueDate: null,
      completedAt: new Date("2026-11-20T12:00:00Z"),
      archivedAt: null,
      createdAt: new Date("2026-11-19T12:00:00Z"),
      updatedAt: new Date("2026-11-20T12:00:00Z"),
    },
    // Completed WITHOUT In Progress transition -> excluded from cycle time!
    {
      id: "t2",
      organizationId: "org_1",
      projectId: "proj_1",
      identifier: "CORE-2",
      title: "Skipped directly to Done",
      status: "DONE",
      assigneeId: "u_dev",
      dueDate: null,
      completedAt: new Date("2026-11-20T18:00:00Z"),
      archivedAt: null,
      createdAt: new Date("2026-11-20T15:00:00Z"),
      updatedAt: new Date("2026-11-20T18:00:00Z"),
    },
    // Reopened task -> status TODO & completedAt null -> NOT counted as completed
    {
      id: "t3",
      organizationId: "org_1",
      projectId: "proj_1",
      identifier: "CORE-3",
      title: "Reopened overdue task",
      status: "TODO",
      assigneeId: "u_dev",
      dueDate: new Date("2026-11-10T00:00:00Z"),
      completedAt: null,
      archivedAt: null,
      createdAt: new Date("2026-11-05T10:00:00Z"),
      updatedAt: new Date("2026-11-21T10:00:00Z"),
    },
    // Archived completed task -> excluded from active & completion counts, tracked in archivedTasks!
    {
      id: "t4",
      organizationId: "org_1",
      projectId: "proj_1",
      identifier: "CORE-4",
      title: "Archived old task",
      status: "DONE",
      assigneeId: "u_dev",
      dueDate: null,
      completedAt: new Date("2026-11-18T12:00:00Z"),
      archivedAt: new Date("2026-11-19T00:00:00Z"),
      createdAt: new Date("2026-11-17T12:00:00Z"),
      updatedAt: new Date("2026-11-19T00:00:00Z"),
    },
  );

  state.taskActivities.push(
    {
      id: "act1",
      taskId: "t1",
      projectId: "proj_1",
      actorId: "u_dev",
      eventType: "STATUS_CHANGED",
      newValue: "In Progress",
      summary: "Moved to In Progress",
      createdAt: new Date("2026-11-20T02:00:00Z"),
    },
    {
      id: "act2",
      taskId: "t3",
      projectId: "proj_1",
      actorId: "u_pm",
      eventType: "TASK_REOPENED",
      newValue: "Todo",
      summary: "Reopened CORE-3",
      createdAt: new Date("2026-11-21T10:00:00Z"),
    },
  );

  const report = await analytics.getProjectAnalytics({
    orgContext: orgCtx,
    projectContext,
    actorUserId: "u_owner",
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });

  assert.equal(report.delivery.totalNonArchivedTasks, 3);
  assert.equal(report.delivery.archivedTasks, 1);
  assert.equal(report.delivery.completedInPeriod, 2);
  assert.equal(report.delivery.activeTasks, 1);
  assert.equal(report.delivery.overdueTasks, 1);
  assert.equal(report.lifecycle.throughputCount, 2);
  assert.equal(report.lifecycle.reopenedInPeriodCount, 1);
  assert.equal(report.lifecycle.cycleTimeStatus, "AVAILABLE");
  assert.equal(report.lifecycle.cycleTimeSampleCount, 1);
  assert.equal(report.lifecycle.cycleTimeExcludedCount, 1);
  assert.equal(report.lifecycle.averageCycleTimeHours, 10);

  // If no tasks have In Progress events (test proj_2 with only direct-done task), return INSUFFICIENT_DATA
  state.tasks.push({
    id: "t5",
    organizationId: "org_1",
    projectId: "proj_2",
    identifier: "SEC-1",
    title: "No cycle event",
    status: "DONE",
    assigneeId: "u_colleague",
    dueDate: null,
    completedAt: new Date("2026-11-20T12:00:00Z"),
    archivedAt: null,
    createdAt: new Date("2026-11-20T08:00:00Z"),
    updatedAt: new Date("2026-11-20T12:00:00Z"),
  });
  const { projectContext: p2Ctx } = await auth.requireProjectAccess("u_owner", "org_1", "proj_2", "view", orgCtx);
  const p2Report = await analytics.getProjectAnalytics({
    orgContext: orgCtx,
    projectContext: p2Ctx,
    actorUserId: "u_owner",
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });
  assert.equal(p2Report.lifecycle.cycleTimeStatus, "INSUFFICIENT_DATA");
  assert.equal(p2Report.lifecycle.averageCycleTimeHours, null);
});

test("RBAC and tenant isolation: blocks MEMBER from org analytics, blocks unrelated project access, and scopes Personal Insights", async () => {
  const { state, analytics, auth, pricing } = createAnalyticsFixture();
  const reflector = new Reflector();

  assert.deepEqual(
    reflector.get(ORG_ROLES_KEY, AnalyticsController.prototype.getOrganizationAnalytics),
    ["OWNER", "ADMIN"],
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, ProjectAnalyticsController.prototype.getProjectAnalytics),
    "view",
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, ProjectAnalyticsController.prototype.upsertProjectBudget),
    "manage",
  );

  const devOrgCtx = await auth.requireOrgMembership("u_dev", "org_1");
  const pmOrgCtx = await auth.requireOrgMembership("u_pm", "org_1");
  await assert.rejects(
    () => analytics.getOrganizationAnalytics({ orgContext: devOrgCtx, query: {} }),
    ForbiddenException,
  );
  await assert.rejects(
    () =>
      pricing.createPricingVersion({
        organizationId: "org_1",
        actorUserId: "u_dev",
        actorOrgRole: "MEMBER",
        body: { provider: "openai", model: "gpt-4o-mini", inputRatePer1m: 1, outputRatePer1m: 2 },
      }),
    ForbiddenException,
  );
  const pmProj2Resolved = await auth.requireProjectAccess("u_pm", "org_1", "proj_2", "view", pmOrgCtx);
  await assert.rejects(
    () =>
      analytics.getProjectAnalytics({
        orgContext: pmOrgCtx,
        projectContext: pmProj2Resolved.projectContext,
        actorUserId: "u_pm",
        query: {},
      }),
    ForbiddenException,
  );
  const devProj2Resolved = await auth.requireProjectAccess("u_dev", "org_1", "proj_2", "view", devOrgCtx);
  await assert.rejects(
    () =>
      analytics.getProjectAnalytics({
        orgContext: devOrgCtx,
        projectContext: devProj2Resolved.projectContext,
        actorUserId: "u_dev",
        query: {},
      }),
    ForbiddenException,
  );
  await assert.rejects(
    () => auth.requireOrgMembership("u_other_org", "org_1"),
    ForbiddenException,
  );

  // Colleague AI chat in proj_2 MUST NEVER appear in u_dev Personal Insights
  state.aiConversations.push({ id: "conv_col", workspaceId: null, taskId: null, task: null });
  state.aiAssistantUsageRecords.push({
    id: "ai_col",
    conversationId: "conv_col",
    organizationId: "org_1",
    projectId: "proj_2",
    userId: "u_colleague",
    actionKind: "CHAT",
    provider: "openai",
    model: "gpt-4o",
    usageAvailable: true,
    inputTokens: 9999,
    outputTokens: 1111,
    totalTokens: 11110,
    costAvailable: true,
    currency: "USD",
    estimatedCostUsd: decimalObj("12.340000"),
    latencyMs: 300,
    createdAt: new Date("2026-11-22T12:00:00Z"),
  });

  const devPersonal = await analytics.getPersonalInsights({
    orgContext: devOrgCtx,
    actorUserId: "u_dev",
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });
  assert.equal(devPersonal.aiUsage.totalRequests, 0);
  assert.equal(devPersonal.aiUsage.totalTokens, null);
});

test("Omitted token usage never coerces to 0 tokens, and versioned pricing keeps historical spend immutable", async () => {
  // 1. Provider omits usage JSON -> usageReported=false, null tokens, null cost
  const client = new AiProviderClient({
    provider: "openai",
    model: "gpt-4o-mini",
    apiKey: "sk-test-123",
    timeoutMs: 5000,
    priceInputPer1m: 0.15,
    priceOutputPer1m: 0.6,
  });
  client.setTransportForTesting({
    async postJson() {
      return {
        status: 200,
        text: JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: "Plan",
                  steps: [{ order: 1, title: "Step", rationale: "Why", targetFiles: ["a.ts"] }],
                  targetFiles: ["a.ts"],
                  risks: [],
                  suggestedChecks: [],
                }),
              },
            },
          ],
        }),
      };
    },
  });
  const unmeasured = await client.generatePlan({
    taskIdentifier: "T-1",
    taskTitle: "Test",
    taskDescription: null,
    repoFullName: "acme/app",
    baseBranch: "main",
    framedFilesContext: "",
  });
  assert.equal(unmeasured.usage.usageReported, false);
  assert.equal(unmeasured.usage.inputTokens, null);
  assert.equal(unmeasured.usage.costAvailable, false);
  assert.equal(unmeasured.usage.estimatedCostUsd, null);

  // 2. Pricing calculation + historical immutability on DB
  const { state, analytics, auth, pricing } = createAnalyticsFixture();
  const orgCtx = await auth.requireOrgMembership("u_owner", "org_1");

  const v1 = await pricing.createPricingVersion({
    organizationId: "org_1",
    actorUserId: "u_owner",
    actorOrgRole: "OWNER",
    body: {
      provider: "openai",
      model: "gpt-4o-mini",
      currency: "USD",
      inputRatePer1m: "1.000000",
      outputRatePer1m: "2.000000",
    },
  });
  const costSnap = computeUsageCostFromPricing({
    usageReported: true,
    inputTokens: 1_000_000,
    outputTokens: 500_000,
    pricingRule: {
      id: v1.id,
      currency: v1.currency,
      inputRatePer1m: v1.inputRatePer1m,
      outputRatePer1m: v1.outputRatePer1m,
    },
  });
  assert.equal(costSnap.costAvailable, true);
  assert.equal(costSnap.estimatedCostUsd, "2.000000");

  state.aiConversations.push({ id: "c_hist", workspaceId: null, taskId: null, task: null });
  state.aiAssistantUsageRecords.push(
    {
      id: "rec_v1",
      conversationId: "c_hist",
      organizationId: "org_1",
      projectId: "proj_1",
      userId: "u_owner",
      actionKind: "CHAT",
      provider: "openai",
      model: "gpt-4o-mini",
      usageAvailable: true,
      inputTokens: 1_000_000,
      outputTokens: 500_000,
      totalTokens: 1_500_000,
      pricingId: v1.id,
      costAvailable: true,
      currency: "USD",
      estimatedCostUsd: decimalObj(costSnap.estimatedCostUsd),
      latencyMs: 400,
      createdAt: new Date("2026-11-10T12:00:00Z"),
    },
    // Record with omitted provider telemetry -> must NOT become 0 tokens or $0.00!
    {
      id: "rec_unreported",
      conversationId: "c_hist",
      organizationId: "org_1",
      projectId: "proj_1",
      userId: "u_owner",
      actionKind: "EXPLAIN",
      provider: "openai",
      model: "gpt-4o-mini",
      usageAvailable: false,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      pricingId: null,
      costAvailable: false,
      currency: "USD",
      estimatedCostUsd: null,
      latencyMs: 250,
      createdAt: new Date("2026-11-11T12:00:00Z"),
    },
  );

  // Create pricing v2 at 10x rate -> rec_v1 historical cost MUST remain $2.000000!
  const v2 = await pricing.createPricingVersion({
    organizationId: "org_1",
    actorUserId: "u_owner",
    actorOrgRole: "OWNER",
    body: {
      provider: "openai",
      model: "gpt-4o-mini",
      currency: "USD",
      inputRatePer1m: "10.000000",
      outputRatePer1m: "20.000000",
    },
  });
  assert.equal(v2.version, 2);
  assert.equal(v2.isActive, true);
  assert.equal(state.aiModelPricings.find((p) => p.id === v1.id).isActive, false);

  const report = await analytics.getOrganizationAnalytics({
    orgContext: orgCtx,
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });
  assert.equal(report.aiUsage.totalRequests, 2);
  assert.equal(report.aiUsage.reportedCallCount, 1);
  assert.equal(report.aiUsage.unreportedCallCount, 1);
  assert.equal(report.aiUsage.tokenUsageStatus, "PARTIAL");
  assert.equal(report.aiUsage.costStatus, "PARTIAL");
  assert.equal(report.aiUsage.spendByCurrency[0].estimatedSpend, "2.000000");

  // Second identical read returns cachedHit=true; cache invalidates when budget updates
  const reportCached = await analytics.getOrganizationAnalytics({
    orgContext: orgCtx,
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });
  assert.equal(reportCached.cachedHit, true);

  await pricing.upsertBudget({
    organizationId: "org_1",
    actorUserId: "u_owner",
    body: { period: "MONTHLY", currency: "USD", amountUsd: "10.00", warningThresholdPct: 80 },
  });
  const afterInvalidate = await analytics.getOrganizationAnalytics({
    orgContext: orgCtx,
    query: { preset: "custom", from: "2026-11-01", to: "2026-11-30", timezone: "UTC" },
  });
  assert.equal(afterInvalidate.cachedHit, false);
});

test("Budget threshold warnings, GitHub review separation, AI execution accuracy, and CSV formula injection protection", async () => {
  const { state, analytics, auth, pricing, exporter } = createAnalyticsFixture();
  const orgCtx = await auth.requireOrgMembership("u_owner", "org_1");
  const { projectContext } = await auth.requireProjectAccess("u_owner", "org_1", "proj_1", "manage", orgCtx);

  // Connected synced GitHub repo & PR separating GitHub vs Internal approval
  state.repos.push({
    id: "repo_1",
    organizationId: "org_1",
    projectId: "proj_1",
    fullName: "acme/core",
    status: "CONNECTED",
    lastSyncedAt: new Date(),
    lastSyncStatus: "SUCCESS",
    lastSyncError: null,
  });
  state.prs.push({
    id: "pr_1",
    organizationId: "org_1",
    projectId: "proj_1",
    projectRepositoryId: "repo_1",
    number: 14,
    state: "OPEN",
    isDraft: false,
    githubReviewDecision: "REVIEW_REQUIRED",
    githubCreatedAt: new Date("2026-11-20T10:00:00Z"),
    githubUpdatedAt: new Date(),
    mergedAt: null,
    closedAt: null,
  });
  state.prInternalReviews.push({
    id: "ir_1",
    organizationId: "org_1",
    projectId: "proj_1",
    pullRequestId: "pr_1",
    decision: "INTERNALLY_APPROVED",
  });

  // AI run completed cleanly, while test was UNAVAILABLE & proposal was REJECTED (never conflated!)
  state.agentRuns.push({
    id: "run_1",
    organizationId: "org_1",
    projectId: "proj_1",
    taskId: "t_x",
    status: "COMPLETED",
    startedAt: new Date("2026-11-20T10:00:00Z"),
    completedAt: new Date("2026-11-20T10:00:30Z"),
    createdAt: new Date("2026-11-20T09:59:55Z"),
    triggeredById: "u_owner",
  });
  state.agentProposals.push({ id: "prop_1", runId: "run_1", status: "REJECTED", createdAt: new Date("2026-11-20T10:00:15Z") });
  state.agentTestRuns.push({ id: "tr_1", runId: "run_1", status: "UNAVAILABLE", sandboxed: false, createdAt: new Date("2026-11-20T10:00:20Z") });

  // Current UTC month spend: $9.00 against $10.00 budget (80% warning) -> APPROACHING_BUDGET
  const now = new Date();
  state.agentUsageRecords.push({
    id: "use_budget_1",
    runId: "run_1",
    organizationId: "org_1",
    projectId: "proj_1",
    userId: "u_owner",
    stageRole: "IMPLEMENTER",
    provider: "openai",
    model: "gpt-4o",
    usageAvailable: true,
    inputTokens: 1000,
    outputTokens: 500,
    totalTokens: 1500,
    costAvailable: true,
    currency: "USD",
    estimatedCostUsd: decimalObj("9.000000"),
    latencyMs: 500,
    createdAt: now,
  });

  const budgetRes = await pricing.upsertBudget({
    organizationId: "org_1",
    projectId: "proj_1",
    actorUserId: "u_owner",
    body: { period: "MONTHLY", currency: "USD", amountUsd: "10.00", warningThresholdPct: 80 },
  });
  assert.equal(budgetRes.state, "APPROACHING_BUDGET");
  assert.equal(budgetRes.budget.hardEnforcementSupported, false);
  assert.equal(state.aiBudgetAuditEvents.length, 1);

  const report = await analytics.getProjectAnalytics({
    orgContext: orgCtx,
    projectContext,
    actorUserId: "u_owner",
    query: { preset: "30d", timezone: "UTC" },
  });
  assert.equal(report.github.githubAwaitingReviewCount, 1);
  assert.equal(report.github.internallyApprovedCount, 1);
  assert.equal(report.aiExecution.completedRuns, 1);
  assert.equal(report.aiExecution.proposalsAcceptedCount, 0);
  assert.equal(report.aiExecution.testsPassedCount, 0);
  assert.equal(report.aiExecution.testsUnavailableCount, 1);

  // CSV formula injection neutralization
  assert.equal(neutralizeCsvCell("=cmd|'/C calc'!A0"), "\"'=cmd|'/C calc'!A0\"");
  assert.equal(neutralizeCsvCell("+SUM(1,2)"), "\"'+SUM(1,2)\"");
  assert.equal(neutralizeCsvCell("-2+3"), "\"'-2+3\"");
  assert.equal(neutralizeCsvCell("@HYPERLINK(\"x\")"), "\"'@HYPERLINK(\"\"x\"\")\"");
  assert.equal(neutralizeCsvCell("\t=1"), "\"'\t=1\"");

  const csvOut = exporter.buildCsv(["project", "title"], [["=bad", "normal"]]);
  assert.match(csvOut, /"'=bad",normal/);

  // Unauthorized export blocked
  const devCtx = await auth.requireOrgMembership("u_dev", "org_1");
  await assert.rejects(
    () =>
      analytics.exportCsv({
        orgContext: devCtx,
        actorUserId: "u_dev",
        scope: "organization",
        query: {},
      }),
    ForbiddenException,
  );
});
