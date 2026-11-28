const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const { Reflector } = require("@nestjs/core");

const { AuthorizationService } = require("../dist/authorization/authorization.service");
const { PROJECT_MODE_KEY } = require("../dist/authorization/authorization.constants");
const { GitHubConfigService } = require("../dist/github/github-config.service");
const { GitHubAppClientService } = require("../dist/github/github-app-client.service");
const { WorkerClientService } = require("../dist/workspaces/worker-client.service");
const { WorkspacesService } = require("../dist/workspaces/workspaces.service");
const { WorkspacesController } = require("../dist/workspaces/workspaces.controller");

const { privateKey: TEST_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function createWorkspacesTestEnv(options = {}) {
  let seq = 1;
  const nextId = (p) => `${p}_${seq++}`;
  const state = {
    users: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    projects: new Map(),
    projectRoles: new Map(),
    projectRepos: new Map(),
    installations: new Map(),
    tasks: new Map(),
    agentRuns: new Map(),
    agentProposals: new Map(),
    devWorkspaces: new Map(),
    snapshots: new Map(),
    events: [],
    terminalSessions: [],
    auditLogs: [],
  };

  function matchWhere(item, where = {}) {
    if (!where) return true;
    for (const [k, v] of Object.entries(where)) {
      if (v === undefined) continue;
      if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
        if ("in" in v) {
          if (!v.in.includes(item[k])) return false;
          continue;
        }
        if ("lt" in v) {
          if (!(item[k] && item[k] < v.lt)) return false;
          continue;
        }
        if (k === "run") {
          const run = state.agentRuns.get(item.runId);
          if (!run || !matchWhere(run, v)) return false;
          continue;
        }
      }
      if (item[k] !== v) return false;
    }
    return true;
  }

  function hydrateWorkspace(ws) {
    return {
      ...ws,
      owner: state.users.get(ws.ownerId),
      snapshots: [...state.snapshots.values()].filter((s) => s.workspaceId === ws.id),
      events: state.events
        .filter((e) => e.workspaceId === ws.id)
        .map((e) => ({ ...e, actor: e.actorId ? state.users.get(e.actorId) : null })),
    };
  }

  const prisma = {
    organizationMembership: {
      findUnique: async ({ where }) => {
        const m = state.memberships.get(
          `${where.organizationId_userId.organizationId}:${where.organizationId_userId.userId}`,
        );
        if (!m) return null;
        return {
          ...m,
          organization: state.organizations.get(m.organizationId),
          user: state.users.get(m.userId),
        };
      },
    },
    project: {
      findFirst: async ({ where }) => state.projects.get(where.id) ?? null,
      findFirstOrThrow: async ({ where }) => {
        const p = state.projects.get(where.id);
        return { ...p, createdBy: state.users.get(p.createdById), roleAssignments: [] };
      },
    },
    projectRoleAssignment: {
      findUnique: async ({ where }) =>
        state.projectRoles.get(`${where.projectId_userId.projectId}:${where.projectId_userId.userId}`) ?? null,
    },
    projectRepository: {
      findFirst: async ({ where }) => {
        const r = [...state.projectRepos.values()].find((item) => matchWhere(item, where));
        return r ? { ...r, installation: state.installations.get(r.installationId) } : null;
      },
    },
    task: {
      findFirst: async ({ where }) => [...state.tasks.values()].find((t) => matchWhere(t, where)) ?? null,
      findMany: async () => [],
    },
    agentRun: {
      findMany: async () => [],
    },
    agentProposal: {
      findFirst: async ({ where }) => {
        const p = [...state.agentProposals.values()].find((item) => matchWhere(item, where));
        if (!p) return null;
        const run = state.agentRuns.get(p.runId);
        return { ...p, run: { ...run, task: state.tasks.get(run.taskId) } };
      },
    },
    devWorkspace: {
      count: async ({ where }) =>
        [...state.devWorkspaces.values()].filter((w) => matchWhere(w, where)).length,
      findMany: async ({ where }) =>
        [...state.devWorkspaces.values()].filter((w) => matchWhere(w, where)).map(hydrateWorkspace),
      findFirst: async ({ where }) => {
        const found = [...state.devWorkspaces.values()].find((w) => matchWhere(w, where));
        return found ? hydrateWorkspace(found) : null;
      },
      create: async ({ data }) => {
        const row = {
          id: nextId("ws"),
          dirtyFileCount: 0,
          errorCode: null,
          errorMessage: null,
          lastActiveAt: new Date(),
          suspendedAt: null,
          stoppedAt: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        state.devWorkspaces.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.devWorkspaces.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
      updateMany: async () => ({ count: 0 }),
    },
    workspaceSnapshot: {
      create: async ({ data }) => {
        const row = { id: data.id ?? nextId("snap"), createdAt: new Date(), restoredAt: null, ...data };
        state.snapshots.set(row.id, row);
        return { ...row, createdBy: row.createdById ? state.users.get(row.createdById) : null };
      },
      update: async ({ where, data }) => {
        const row = state.snapshots.get(where.id);
        Object.assign(row, data);
        return row;
      },
    },
    workspaceEvent: {
      create: async ({ data }) => {
        const row = { id: nextId("wevt"), createdAt: new Date(), ...data };
        state.events.push(row);
        return row;
      },
    },
    workspaceTerminalSession: {
      create: async ({ data }) => {
        state.terminalSessions.push(data);
        return data;
      },
    },
    taskActivity: {
      create: async () => ({}),
    },
    organizationAuditLog: {
      create: async ({ data }) => {
        state.auditLogs.push(data);
        return data;
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const workerClient = new WorkerClientService({
    get: (k) => {
      if (k === "INTERNAL_AUTH_SECRET") return "devcollab-brick7-api-test-secret-0123456789";
      return {
        baseUrl: "http://127.0.0.1:4100",
        terminalPublicWsUrl: "ws://localhost:4100/terminal",
        requestTimeoutMs: 5000,
        workspaceTtlHours: 24,
        workspaceMaxPerProject: 10,
      };
    },
  });

  const workerDirExists = { value: true };
  workerClient.setTransportForTesting({
    async request(url, init) {
      if (url.endsWith("/health")) {
        return {
          status: 200,
          text: JSON.stringify({
            ok: true,
            workerId: "worker-unit",
            gitAvailable: true,
            sandboxAvailable: Boolean(options.terminalAvailable),
            sandboxReason: options.terminalAvailable
              ? "Docker sandbox ready"
              : "Docker missing; host execution disabled",
            terminalAvailable: Boolean(options.terminalAvailable),
            terminalReason: options.terminalAvailable
              ? "Docker terminal container ready"
              : "Docker sandbox unavailable",
            storageMode: "EPHEMERAL",
            maxFileBytes: 524_288,
          }),
        };
      }
      if (url.endsWith("/workspaces/init")) {
        return { status: 200, text: JSON.stringify({ fileCount: 3, totalBytes: 512, headSha: "headsha123" }) };
      }
      if (url.endsWith("/exists")) {
        return { status: 200, text: JSON.stringify({ exists: workerDirExists.value }) };
      }
      if (url.endsWith("/snapshot")) {
        return {
          status: 200,
          text: JSON.stringify({
            storageKey: "ws/snap.tar.gz",
            sizeBytes: 120,
            checksumSha256: "chk123",
            trackedFileCount: 1,
            untrackedFileCount: 0,
          }),
        };
      }
      if (url.endsWith("/restore-snapshot")) {
        return { status: 200, text: JSON.stringify({ restoredFiles: 1 }) };
      }
      if (url.endsWith("/apply-patch")) {
        return { status: 200, text: JSON.stringify({ filesChanged: 1, status: { files: [{ path: "a.ts" }] } }) };
      }
      if (init.method === "DELETE") {
        return { status: 200, text: JSON.stringify({ deleted: true }) };
      }
      return { status: 200, text: JSON.stringify({}) };
    },
  });

  const ghConfig = new GitHubConfigService({
    get: () => ({ appId: "123", appSlug: "dc-test", privateKey: TEST_PEM, apiBaseUrl: "https://api.github.com" }),
  });
  const ghClient = new GitHubAppClientService(ghConfig);
  ghClient.setTransportForTesting(
    {
      async request(url) {
        if (url.includes("/access_tokens")) return { status: 201, headers: { get: () => null }, json: { token: "ghs_secret_tok" } };
        return { status: 200, headers: { get: () => null }, json: { name: "main", commit: { sha: "base123456" } } };
      },
    },
    {
      async download() {
        return Buffer.from("tarball", "utf8");
      },
    },
  );

  const authz = new AuthorizationService({ prisma });
  const service = new WorkspacesService({ prisma }, workerClient, ghConfig, ghClient);

  state.users.set("u_pm", { id: "u_pm", name: "PM", email: "pm@example.com", image: null });
  state.users.set("u_dev1", { id: "u_dev1", name: "Dev1", email: "dev1@example.com", image: null });
  state.users.set("u_dev2", { id: "u_dev2", name: "Dev2", email: "dev2@example.com", image: null });
  state.users.set("u_mem", { id: "u_mem", name: "Mem", email: "mem@example.com", image: null });

  state.organizations.set("org1", { id: "org1", name: "Acme", slug: "acme", description: null, createdAt: new Date() });
  for (const uid of ["u_pm", "u_dev1", "u_dev2", "u_mem"]) {
    state.memberships.set(`org1:${uid}`, { id: `m_${uid}`, organizationId: "org1", userId: uid, role: "MEMBER", status: "ACTIVE", joinedAt: new Date() });
  }
  state.projects.set("proj1", {
    id: "proj1",
    organizationId: "org1",
    name: "Core",
    key: "COR",
    slug: "core",
    description: null,
    status: "ACTIVE",
    allowDeveloperAiRuns: false,
    createdById: "u_pm",
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  state.projectRoles.set("proj1:u_pm", { projectId: "proj1", userId: "u_pm", role: "PROJECT_MANAGER", canRunAi: true });
  state.projectRoles.set("proj1:u_dev1", { projectId: "proj1", userId: "u_dev1", role: "DEVELOPER", canRunAi: true });
  state.projectRoles.set("proj1:u_dev2", { projectId: "proj1", userId: "u_dev2", role: "DEVELOPER", canRunAi: false });

  state.installations.set("inst1", { id: "inst1", githubInstallationId: "1", status: "ACTIVE" });
  state.projectRepos.set("repo1", {
    id: "repo1",
    organizationId: "org1",
    projectId: "proj1",
    installationId: "inst1",
    owner: "acme",
    name: "core",
    fullName: "acme/core",
    defaultBranch: "main",
    status: "CONNECTED",
  });
  state.tasks.set("task1", {
    id: "task1",
    organizationId: "org1",
    projectId: "proj1",
    identifier: "COR-001",
    title: "Implement cache",
    archivedAt: null,
  });
  state.agentRuns.set("run1", {
    id: "run1",
    organizationId: "org1",
    projectId: "proj1",
    taskId: "task1",
    repoFullName: "acme/core",
    baseCommitSha: "base123456",
  });
  state.agentProposals.set("prop_match", {
    id: "prop_match",
    runId: "run1",
    version: 1,
    baseCommitSha: "base123456",
    rawPatch: "diff --git a/a.ts b/a.ts",
  });
  state.agentProposals.set("prop_stale", {
    id: "prop_stale",
    runId: "run1",
    version: 2,
    baseCommitSha: "old_deadbeef",
    rawPatch: "diff --git a/a.ts b/a.ts",
  });

  return { state, authz, service, workerDirExists };
}

test("Workspace single-user isolation, unassigned member block, lifecycle snapshot resume & stale AI patch block", async () => {
  const env = createWorkspacesTestEnv({ terminalAvailable: false });
  const dev1Ctx = await env.authz.requireProjectAccess("u_dev1", "org1", "proj1", "view");
  const dev2Ctx = await env.authz.requireProjectAccess("u_dev2", "org1", "proj1", "view");
  const memCtx = await env.authz.requireProjectAccess("u_mem", "org1", "proj1", "view");
  const pmCtx = await env.authz.requireProjectAccess("u_pm", "org1", "proj1", "view");

  // Unassigned org MEMBER cannot create workspace
  await assert.rejects(
    () => env.service.createWorkspace("u_mem", "org1", "proj1", memCtx.projectContext, {}),
    /Developer, Project Manager, Admin, or Owner/,
  );

  // Dev1 creates workspace -> promoted ACTIVE on detail read, storageWarning honest
  const ws = await env.service.createWorkspace("u_dev1", "org1", "proj1", dev1Ctx.projectContext, {
    name: "dev1-ide",
    taskId: "task1",
  });
  assert.equal(ws.status, "ACTIVE");
  assert.equal(ws.storageMode, "EPHEMERAL");
  assert.match(ws.storageWarning, /Ephemeral worker storage/);

  // Dev2 CANNOT access Dev1's single-user workspace
  await assert.rejects(
    () => env.service.getWorkspaceDetail("u_dev2", "org1", "proj1", ws.id, dev2Ctx.projectContext),
    /belongs to another team member/,
  );

  // Unavailable terminal throws 503 and records TERMINAL_REJECTED
  await assert.rejects(
    () => env.service.createTerminalSession("u_dev1", "org1", "proj1", ws.id, dev1Ctx.projectContext),
    /Docker sandbox unavailable/,
  );
  assert.equal(env.state.terminalSessions[0].status, "REJECTED");

  // Stale AI proposal baseCommitSha rejected cleanly
  await assert.rejects(
    () => env.service.applyAiProposal("u_dev1", "org1", "proj1", ws.id, dev1Ctx.projectContext, "prop_stale"),
    /Stale AI proposal/,
  );

  // Matching AI proposal applies cleanly
  const applied = await env.service.applyAiProposal("u_dev1", "org1", "proj1", ws.id, dev1Ctx.projectContext, "prop_match");
  assert.equal(applied.filesChanged, 1);

  // Stop captures snapshot; simulate worker folder wipe; Resume reconstructs from snapshot!
  const stopped = await env.service.transitionLifecycle("u_pm", "org1", "proj1", ws.id, pmCtx.projectContext, "stop");
  assert.equal(stopped.status, "STOPPED");
  assert.equal(stopped.snapshots.length, 1);

  env.workerDirExists.value = false;
  const resumed = await env.service.transitionLifecycle("u_dev1", "org1", "proj1", ws.id, dev1Ctx.projectContext, "resume");
  assert.equal(resumed.status, "ACTIVE");
});

test("Terminal authorization restricts PM from opening another developer's shell and mints ticket when sandbox is ready", async () => {
  const env = createWorkspacesTestEnv({ terminalAvailable: true });
  const dev1Ctx = await env.authz.requireProjectAccess("u_dev1", "org1", "proj1", "view");
  const pmCtx = await env.authz.requireProjectAccess("u_pm", "org1", "proj1", "view");

  const ws = await env.service.createWorkspace("u_dev1", "org1", "proj1", dev1Ctx.projectContext, { name: "term-ws" });

  // Non-owner PM cannot hijack developer's interactive terminal session
  await assert.rejects(
    () => env.service.createTerminalSession("u_pm", "org1", "proj1", ws.id, pmCtx.projectContext),
    /strictly restricted to the workspace owner/,
  );

  const ticket = await env.service.createTerminalSession("u_dev1", "org1", "proj1", ws.id, dev1Ctx.projectContext);
  assert.equal(ticket.sandboxed, true);
  assert.ok(ticket.token.split(".").length === 3);

  const reflector = new Reflector();
  assert.equal(
    reflector.get(PROJECT_MODE_KEY, WorkspacesController.prototype.applyProposal),
    "ai",
  );
});
