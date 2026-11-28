const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const { Reflector } = require("@nestjs/core");

const { AuthorizationService } = require("../dist/authorization/authorization.service");
const { ProjectAccessGuard } = require("../dist/authorization/project-access.guard");
const {
  PROJECT_MODE_KEY,
} = require("../dist/authorization/authorization.constants");
const { AiConfigService } = require("../dist/ai/ai-config.service");
const { AiRunsService } = require("../dist/ai/ai-runs.service");
const { AiController } = require("../dist/ai/ai.controller");
const { GitHubConfigService } = require("../dist/github/github-config.service");
const { GitHubAppClientService } = require("../dist/github/github-app-client.service");
const { ProjectsService } = require("../dist/projects/projects.service");
const { TasksService } = require("../dist/tasks/tasks.service");

const { privateKey: TEST_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function createAiTestEnv(options = {}) {
  let seq = 1;
  const nextId = (prefix) => `${prefix}_${seq++}`;
  const state = {
    users: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    projects: new Map(),
    projectRoles: new Map(),
    auditLogs: [],
    tasks: new Map(),
    comments: new Map(),
    activities: [],
    installations: new Map(),
    projectRepos: new Map(),
    taskPrLinks: new Map(),
    agentRuns: new Map(),
    agentPlans: new Map(),
    agentProposals: new Map(),
    agentTestRuns: new Map(),
    agentRunEvents: [],
    agentUsageRecords: [],
  };

  function matchWhere(item, where = {}) {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (k === "AND" && Array.isArray(v)) {
        if (!v.every((sub) => matchWhere(item, sub))) return false;
        continue;
      }
      if (k === "OR" && Array.isArray(v)) {
        if (!v.some((sub) => matchWhere(item, sub))) return false;
        continue;
      }
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if ("in" in v) {
          if (!v.in.includes(item[k])) return false;
          continue;
        }
        if ("not" in v) {
          if (item[k] === v.not) return false;
          continue;
        }
        if ("gte" in v) {
          if (!(item[k] >= v.gte)) return false;
          continue;
        }
        if ("lt" in v) {
          if (!(item[k] < v.lt)) return false;
          continue;
        }
        if ("gt" in v) {
          if (!(item[k] > v.gt)) return false;
          continue;
        }
        if (k === "installation") {
          const inst = state.installations.get(item.installationId);
          if (!inst || !matchWhere(inst, v)) return false;
          continue;
        }
      }
      if (item[k] !== v) return false;
    }
    return true;
  }

  function hydrateRun(run) {
    return {
      ...run,
      triggeredBy: run.triggeredById ? state.users.get(run.triggeredById) ?? null : null,
      task: state.tasks.get(run.taskId) ?? null,
      plans: [...state.agentPlans.values()]
        .filter((p) => p.runId === run.id)
        .sort((a, b) => b.version - a.version)
        .map((p) => ({
          ...p,
          decidedBy: p.decidedById ? state.users.get(p.decidedById) ?? null : null,
        })),
      proposals: [...state.agentProposals.values()]
        .filter((p) => p.runId === run.id)
        .sort((a, b) => b.version - a.version)
        .map((p) => ({
          ...p,
          reviewedBy: p.reviewedById ? state.users.get(p.reviewedById) ?? null : null,
        })),
      testRuns: [...state.agentTestRuns.values()]
        .filter((t) => t.runId === run.id)
        .sort((a, b) => b.createdAt - a.createdAt),
      events: state.agentRunEvents
        .filter((e) => e.runId === run.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((e) => ({
          ...e,
          actor: e.actorId ? state.users.get(e.actorId) ?? null : null,
        })),
      usageRecords: state.agentUsageRecords
        .filter((u) => u.runId === run.id)
        .sort((a, b) => a.createdAt - b.createdAt),
    };
  }

  const prisma = {
    user: {
      findUnique: async ({ where }) => state.users.get(where.id) ?? null,
    },
    organizationMembership: {
      findUnique: async ({ where }) => {
        const key = `${where.organizationId_userId.organizationId}:${where.organizationId_userId.userId}`;
        const m = state.memberships.get(key);
        if (!m) return null;
        return {
          ...m,
          organization: state.organizations.get(m.organizationId),
          user: state.users.get(m.userId),
        };
      },
      findMany: async ({ where }) =>
        [...state.memberships.values()]
          .filter((m) => matchWhere(m, where))
          .map((m) => ({ ...m, user: state.users.get(m.userId) })),
    },
    project: {
      findFirst: async ({ where }) => {
        const proj = [...state.projects.values()].find((p) => matchWhere(p, where));
        if (!proj) return null;
        return {
          ...proj,
          createdBy: proj.createdById ? state.users.get(proj.createdById) ?? null : null,
          roleAssignments: [...state.projectRoles.values()]
            .filter((r) => r.projectId === proj.id)
            .map((r) => ({ ...r, user: state.users.get(r.userId) })),
        };
      },
      findUniqueOrThrow: async ({ where }) => {
        const proj = state.projects.get(where.id);
        if (!proj) throw new Error("Project missing");
        return {
          ...proj,
          createdBy: proj.createdById ? state.users.get(proj.createdById) ?? null : null,
          roleAssignments: [...state.projectRoles.values()]
            .filter((r) => r.projectId === proj.id)
            .map((r) => ({ ...r, user: state.users.get(r.userId) })),
        };
      },
      update: async ({ where, data }) => {
        const proj = state.projects.get(where.id);
        Object.assign(proj, data, { updatedAt: new Date() });
        return proj;
      },
    },
    projectRoleAssignment: {
      findUnique: async ({ where }) => {
        const k = `${where.projectId_userId.projectId}:${where.projectId_userId.userId}`;
        const r = state.projectRoles.get(k);
        if (!r) return null;
        return { ...r, user: state.users.get(r.userId) };
      },
      upsert: async ({ where, update, create }) => {
        const k = `${where.projectId_userId.projectId}:${where.projectId_userId.userId}`;
        const existing = state.projectRoles.get(k);
        if (existing) {
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        const row = { id: nextId("prole"), createdAt: new Date(), updatedAt: new Date(), ...create };
        state.projectRoles.set(k, row);
        return row;
      },
    },
    projectRepository: {
      findFirst: async ({ where }) => {
        const repo = [...state.projectRepos.values()].find((r) => matchWhere(r, where));
        if (!repo) return null;
        return { ...repo, installation: state.installations.get(repo.installationId) };
      },
    },
    task: {
      findFirst: async ({ where }) => {
        const task = [...state.tasks.values()].find((t) => matchWhere(t, where));
        if (!task) return null;
        const proj = state.projects.get(task.projectId);
        return {
          ...task,
          project: proj,
          assignee: task.assigneeId ? state.users.get(task.assigneeId) ?? null : null,
          creator: task.creatorId ? state.users.get(task.creatorId) ?? null : null,
          _count: { comments: 0 },
          comments: [],
          activities: state.activities
            .filter((a) => a.taskId === task.id)
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((a) => ({ ...a, actor: a.actorId ? state.users.get(a.actorId) ?? null : null })),
        };
      },
    },
    taskPullRequestLink: {
      findMany: async () => [],
    },
    agentRun: {
      findFirst: async ({ where, orderBy }) => {
        let rows = [...state.agentRuns.values()].filter((r) => matchWhere(r, where));
        if (orderBy) rows.sort((a, b) => b.createdAt - a.createdAt);
        const found = rows[0];
        return found ? hydrateRun(found) : null;
      },
      findMany: async ({ where }) =>
        [...state.agentRuns.values()]
          .filter((r) => matchWhere(r, where))
          .sort((a, b) => b.createdAt - a.createdAt)
          .map(hydrateRun),
      count: async ({ where }) =>
        [...state.agentRuns.values()].filter((r) => matchWhere(r, where)).length,
      create: async ({ data }) => {
        const now = new Date();
        const row = {
          id: nextId("run"),
          attemptCount: 0,
          maxAttempts: 2,
          activePlanId: null,
          activeProposalId: null,
          workerId: null,
          leaseExpiresAt: null,
          cancelRequestedAt: null,
          errorCode: null,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        state.agentRuns.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.agentRuns.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    agentPlan: {
      findFirst: async ({ where }) =>
        [...state.agentPlans.values()]
          .filter((p) => matchWhere(p, where))
          .sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => {
        const row = { id: nextId("plan"), createdAt: new Date(), decidedById: null, decidedAt: null, decisionNote: null, revisionFeedback: null, ...data };
        state.agentPlans.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.agentPlans.get(where.id);
        Object.assign(row, data);
        return row;
      },
    },
    agentProposal: {
      findFirst: async ({ where }) =>
        [...state.agentProposals.values()]
          .filter((p) => matchWhere(p, where))
          .sort((a, b) => b.version - a.version)[0] ?? null,
      create: async ({ data }) => {
        const row = { id: nextId("prop"), createdAt: new Date(), reviewedById: null, reviewedAt: null, reviewNote: null, revisionFeedback: null, ...data };
        state.agentProposals.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.agentProposals.get(where.id);
        Object.assign(row, data);
        return row;
      },
    },
    agentRunEvent: {
      create: async ({ data }) => {
        const row = { id: nextId("evt"), createdAt: new Date(), actorId: null, statusFrom: null, statusTo: null, metadata: null, ...data };
        state.agentRunEvents.push(row);
        return row;
      },
    },
    agentUsageRecord: {
      findMany: async ({ where }) =>
        state.agentUsageRecords.filter((u) => matchWhere(u, where)),
    },
    taskActivity: {
      create: async ({ data }) => {
        const row = { id: nextId("tact"), createdAt: new Date(), ...data };
        state.activities.push(row);
        return row;
      },
    },
    organizationAuditLog: {
      create: async ({ data }) => {
        const row = { id: nextId("audit"), createdAt: new Date(), ...data };
        state.auditLogs.push(row);
        return row;
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const fakeAiConfig = new AiConfigService({
    get: () =>
      options.aiConfigured === false
        ? {
            provider: undefined,
            model: undefined,
            apiKey: undefined,
            timeoutMs: 45000,
            priceInputPer1m: 0,
            priceOutputPer1m: 0,
            maxContextFiles: 24,
            maxContextBytes: 96000,
            sandboxEnabled: true,
            sandboxDockerImage: "node:24-alpine",
          }
        : {
            provider: "openai",
            model: "gpt-4o-mini",
            apiKey: "sk-test-secret-do-not-expose",
            timeoutMs: 45000,
            priceInputPer1m: 0.15,
            priceOutputPer1m: 0.6,
            maxContextFiles: 24,
            maxContextBytes: 96000,
            sandboxEnabled: true,
            sandboxDockerImage: "node:24-alpine",
          },
  });
  fakeAiConfig.setSandboxCheckerForTesting(async () => ({
    available: false,
    reason: "Docker sandbox unavailable in unit test.",
  }));

  const fakeGitHubConfig = new GitHubConfigService({
    get: () =>
      options.githubConfigured === false
        ? { apiBaseUrl: "https://api.github.com" }
        : {
            appId: "12345",
            appSlug: "devcollab-test",
            privateKey: TEST_PEM,
            apiBaseUrl: "https://api.github.com",
          },
  });

  const githubClient = new GitHubAppClientService(fakeGitHubConfig);
  githubClient.setTransportForTesting({
    async request(url) {
      if (url.includes("/access_tokens")) {
        return { status: 201, headers: { get: () => null }, json: { token: "ghs_test_token" } };
      }
      if (url.includes("/branches/")) {
        return {
          status: 200,
          headers: { get: () => null },
          json: { name: "main", commit: { sha: "abc1234567890" } },
        };
      }
      return { status: 404, headers: { get: () => null }, json: { message: "Not Found" } };
    },
  });

  const db = { prisma };
  const authz = new AuthorizationService(db);
  const tasksService = new TasksService(db, authz);
  const projectsService = new ProjectsService(db, authz, tasksService);
  const aiRunsService = new AiRunsService(
    db,
    fakeAiConfig,
    fakeGitHubConfig,
    githubClient,
    tasksService,
  );

  // Seed core fixture records
  state.users.set("u_owner", { id: "u_owner", name: "Owner", email: "owner@example.com", image: null });
  state.users.set("u_pm", { id: "u_pm", name: "PM", email: "pm@example.com", image: null });
  state.users.set("u_dev", { id: "u_dev", name: "Dev", email: "dev@example.com", image: null });
  state.users.set("u_mem", { id: "u_mem", name: "Member", email: "mem@example.com", image: null });
  state.users.set("u_other", { id: "u_other", name: "Other", email: "other@example.com", image: null });

  state.organizations.set("org1", { id: "org1", name: "Acme", slug: "acme", description: null, createdAt: new Date() });
  state.organizations.set("org2", { id: "org2", name: "OtherOrg", slug: "other", description: null, createdAt: new Date() });

  state.memberships.set("org1:u_owner", { id: "m1", organizationId: "org1", userId: "u_owner", role: "OWNER", status: "ACTIVE", joinedAt: new Date() });
  state.memberships.set("org1:u_pm", { id: "m2", organizationId: "org1", userId: "u_pm", role: "MEMBER", status: "ACTIVE", joinedAt: new Date() });
  state.memberships.set("org1:u_dev", { id: "m3", organizationId: "org1", userId: "u_dev", role: "MEMBER", status: "ACTIVE", joinedAt: new Date() });
  state.memberships.set("org1:u_mem", { id: "m4", organizationId: "org1", userId: "u_mem", role: "MEMBER", status: "ACTIVE", joinedAt: new Date() });
  state.memberships.set("org2:u_other", { id: "m5", organizationId: "org2", userId: "u_other", role: "OWNER", status: "ACTIVE", joinedAt: new Date() });

  state.projects.set("proj1", {
    id: "proj1",
    organizationId: "org1",
    name: "Core",
    key: "COR",
    slug: "core",
    description: null,
    status: "ACTIVE",
    allowDeveloperAiRuns: false,
    createdById: "u_owner",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  state.projectRoles.set("proj1:u_pm", { id: "pr1", projectId: "proj1", userId: "u_pm", role: "PROJECT_MANAGER", canRunAi: true, createdAt: new Date() });
  state.projectRoles.set("proj1:u_dev", { id: "pr2", projectId: "proj1", userId: "u_dev", role: "DEVELOPER", canRunAi: false, createdAt: new Date() });

  state.installations.set("inst1", { id: "inst1", githubInstallationId: "999", status: "ACTIVE" });
  state.projectRepos.set("repo1", {
    id: "repo1",
    organizationId: "org1",
    projectId: "proj1",
    installationId: "inst1",
    owner: "acme",
    name: "core-api",
    fullName: "acme/core-api",
    defaultBranch: "main",
    status: "CONNECTED",
  });

  state.tasks.set("task1", {
    id: "task1",
    organizationId: "org1",
    projectId: "proj1",
    sequenceNumber: 1,
    identifier: "COR-001",
    title: "Fix health endpoint status",
    description: "Ensure /health returns service version cleanly.",
    status: "TODO",
    priority: "HIGH",
    labels: ["api"],
    assigneeId: "u_dev",
    creatorId: "u_pm",
    archivedAt: null,
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return { state, authz, aiRunsService, projectsService };
}

test("Unconfigured AI provider produces explicit preflight blockers without exposing secrets", async () => {
  const env = createAiTestEnv({ aiConfigured: false });
  const ctx = await env.authz.requireProjectAccess("u_owner", "org1", "proj1", "view");
  const status = await env.aiRunsService.getCapabilityStatus("org1", "proj1", ctx.projectContext, "task1");
  assert.equal(status.aiConfigured, false);
  assert.equal(status.sandboxAvailable, false);
  assert.ok(status.blockingReasons.some((r) => r.includes("AI provider")));

  await assert.rejects(
    () => env.aiRunsService.startRun("u_owner", "org1", "proj1", "task1", ctx.projectContext, {}),
    /not configured/i,
  );
});

test("RBAC & AI policy enforcement: dev denied by default, PM/Owner allowed, explicit grant & cross-org isolation", async () => {
  const env = createAiTestEnv();

  // Developer is denied "ai" mode when allowDeveloperAiRuns is false & canRunAi is false
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_dev", "org1", "proj1", "ai"),
    /AI coding agents are restricted/,
  );

  // Unassigned member also denied "ai" mode even if viewing works
  const memView = await env.authz.requireProjectAccess("u_mem", "org1", "proj1", "view");
  assert.equal(memView.projectContext.canRunAi, false);
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_mem", "org1", "proj1", "ai"),
    /AI coding agents are restricted/,
  );

  // Cross-org IDOR fails cleanly
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_other", "org1", "proj1", "view"),
    /do not have access/,
  );

  // PM grants individual AI permission to Developer via assignRole
  await env.projectsService.assignRole("u_pm", "MEMBER", "PROJECT_MANAGER", "org1", "proj1", {
    userId: "u_dev",
    role: "DEVELOPER",
    canRunAi: true,
  });

  const devAllowed = await env.authz.requireProjectAccess("u_dev", "org1", "proj1", "ai");
  assert.equal(devAllowed.projectContext.canRunAi, true);

  // Revoke individual grant and enable project-wide allowDeveloperAiRuns
  await env.projectsService.assignRole("u_pm", "MEMBER", "PROJECT_MANAGER", "org1", "proj1", {
    userId: "u_dev",
    role: "DEVELOPER",
    canRunAi: false,
  });
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_dev", "org1", "proj1", "ai"),
  );

  await env.projectsService.updateProject("u_pm", "MEMBER", "org1", "proj1", {
    allowDeveloperAiRuns: true,
  });
  const devViaProject = await env.authz.requireProjectAccess("u_dev", "org1", "proj1", "ai");
  assert.equal(devViaProject.projectContext.canRunAi, true);
});

test("Idempotency key, single-active-run lock, stale-context approval guard, revision preservation & safe accept", async () => {
  const env = createAiTestEnv();
  const ctx = await env.authz.requireProjectAccess("u_pm", "org1", "proj1", "ai");

  // Start run with idempotency key
  const run1 = await env.aiRunsService.startRun("u_pm", "org1", "proj1", "task1", ctx.projectContext, {
    idempotencyKey: "req-idem-1",
    userInstructions: "Focus on /health",
  });
  assert.equal(run1.status, "QUEUED");
  assert.equal(run1.baseCommitSha, "abc1234567890");
  assert.equal(env.state.agentRuns.size, 1);

  // Duplicate idempotency key returns same run without creating another
  const replay = await env.aiRunsService.startRun("u_pm", "org1", "proj1", "task1", ctx.projectContext, {
    idempotencyKey: "req-idem-1",
  });
  assert.equal(replay.id, run1.id);
  assert.equal(env.state.agentRuns.size, 1);

  // Different idempotency key while task already has active run -> 409 Conflict
  await assert.rejects(
    () =>
      env.aiRunsService.startRun("u_pm", "org1", "proj1", "task1", ctx.projectContext, {
        idempotencyKey: "req-idem-2",
      }),
    /already active/,
  );

  // Invalid state transition before AWAITING_APPROVAL
  await assert.rejects(
    () =>
      env.aiRunsService.decidePlan("u_pm", "org1", "proj1", run1.id, ctx.projectContext, {
        decision: "APPROVE",
      }),
    /QUEUED state/,
  );

  // Simulate worker delivering plan v1 -> AWAITING_APPROVAL
  env.state.agentPlans.set("plan_v1", {
    id: "plan_v1",
    runId: run1.id,
    version: 1,
    status: "PENDING",
    summary: "Add version field",
    steps: [{ order: 1, title: "Update health controller", rationale: "Return version", targetFiles: ["src/health.ts"] }],
    targetFiles: ["src/health.ts"],
    risks: [],
    suggestedChecks: ["npm test"],
    contextSummary: { repoFullName: "acme/core-api", baseBranch: "main", baseCommitSha: "abc1234567890", indexedFileCount: 5, selectedFiles: [] },
    createdAt: new Date(),
  });
  const storedRun = env.state.agentRuns.get(run1.id);
  storedRun.status = "AWAITING_APPROVAL";
  storedRun.activePlanId = "plan_v1";

  // Edit task title to trigger stale-context check
  env.state.tasks.get("task1").title = "Fix health endpoint status AND metrics";
  await assert.rejects(
    () =>
      env.aiRunsService.decidePlan("u_pm", "org1", "proj1", run1.id, ctx.projectContext, {
        decision: "APPROVE",
      }),
    /Task fields .* changed/,
  );

  // Approve with explicit stale acknowledgement
  const afterApprove = await env.aiRunsService.decidePlan("u_pm", "org1", "proj1", run1.id, ctx.projectContext, {
    decision: "APPROVE",
    acknowledgeStaleContext: true,
    note: "Verified updated requirement",
  });
  assert.equal(afterApprove.status, "RUNNING");
  assert.equal(afterApprove.activePlan.status, "APPROVED");

  // Simulate worker delivering proposal v1 -> AWAITING_REVIEW
  const prop1 = {
    id: "prop_v1",
    runId: run1.id,
    planId: "plan_v1",
    version: 1,
    status: "PENDING_REVIEW",
    summary: "Implemented health version field",
    reviewSummary: "Looks solid",
    reviewFindings: [],
    changedFiles: [],
    rawPatch: "diff --git a/src/health.ts b/src/health.ts\n--- a/src/health.ts\n+++ b/src/health.ts\n@@ -1,1 +1,1 @@\n-old\n+new\n",
    filesChangedCount: 1,
    additionsCount: 1,
    deletionsCount: 1,
    baseCommitSha: "abc1234567890",
    createdAt: new Date(),
  };
  env.state.agentProposals.set(prop1.id, prop1);
  storedRun.status = "AWAITING_REVIEW";
  storedRun.activeProposalId = prop1.id;

  // Request revision: preserves prop1 as REVISION_REQUESTED and transitions back to RUNNING
  const afterRevise = await env.aiRunsService.decideProposal("u_pm", "org1", "proj1", run1.id, ctx.projectContext, {
    decision: "REVISE",
    note: "Add unit test assertion too",
  });
  assert.equal(afterRevise.status, "RUNNING");
  assert.equal(env.state.agentProposals.get("prop_v1").status, "REVISION_REQUESTED");

  // Simulate worker creating proposal v2 -> AWAITING_REVIEW
  const prop2 = { ...prop1, id: "prop_v2", version: 2, status: "PENDING_REVIEW", createdAt: new Date(Date.now() + 1000) };
  env.state.agentProposals.set(prop2.id, prop2);
  storedRun.status = "AWAITING_REVIEW";
  storedRun.activeProposalId = prop2.id;

  // Accept proposal v2: run completes, both proposals preserved, and task.status remains TODO!
  const afterAccept = await env.aiRunsService.decideProposal("u_pm", "org1", "proj1", run1.id, ctx.projectContext, {
    decision: "ACCEPT",
    note: "Accepted internally",
  });
  assert.equal(afterAccept.status, "COMPLETED");
  assert.equal(afterAccept.proposals.length, 2);
  assert.equal(env.state.agentProposals.get("prop_v1").status, "REVISION_REQUESTED");
  assert.equal(env.state.agentProposals.get("prop_v2").status, "ACCEPTED");
  assert.equal(env.state.tasks.get("task1").status, "TODO");
});

test("AiController metadata & ProjectAccessGuard enforce ai vs view routes", async () => {
  const reflector = new Reflector();
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, AiController.prototype.startRun),
    "ai",
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, AiController.prototype.decidePlan),
    "ai",
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, AiController.prototype.decideProposal),
    "ai",
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, AiController.prototype.cancelRun),
    "ai",
  );
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, AiController.prototype.getTaskWorkspace),
    "view",
  );

  const env = createAiTestEnv();
  const guard = new ProjectAccessGuard(reflector, env.authz);
  const mockCtx = {
    getHandler: () => AiController.prototype.startRun,
    getClass: () => AiController,
    switchToHttp: () => ({
      getRequest: () => ({
        userId: "u_dev",
        params: { orgId: "org1", projectId: "proj1" },
      }),
    }),
  };
  await assert.rejects(() => guard.canActivate(mockCtx), /restricted/);
});
