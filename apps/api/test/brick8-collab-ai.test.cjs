const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const {
  AiProviderClient,
  AiProviderError,
  extractAssistantCitations,
  extractAssistantPatchProposal,
} = require("@devcollab/ai-core");
const { AiConfigService } = require("../dist/ai/ai-config.service");
const { AiAssistantService } = require("../dist/ai/ai-assistant.service");
const { CollabService } = require("../dist/collab/collab.service");
const { WorkerClientService } = require("../dist/workspaces/worker-client.service");
const { WorkspacesService } = require("../dist/workspaces/workspaces.service");
const { GitHubConfigService } = require("../dist/github/github-config.service");
const { GitHubAppClientService } = require("../dist/github/github-app-client.service");

function makeSseReadableStream(chunks, delayMs = 10) {
  const encoder = new TextEncoder();
  let idx = 0;
  return new ReadableStream({
    async pull(controller) {
      if (idx >= chunks.length) {
        controller.close();
        return;
      }
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      controller.enqueue(encoder.encode(chunks[idx++]));
    },
  });
}

function createBrick8MockDb() {
  let seq = 1;
  const nextId = (prefix) => `${prefix}_${seq++}`;

  const state = {
    users: new Map([
      ["u_owner", { id: "u_owner", name: "Owner", email: "owner@acme.dev", image: null }],
      ["u_editor", { id: "u_editor", name: "Editor", email: "editor@acme.dev", image: null }],
      ["u_viewer", { id: "u_viewer", name: "Viewer", email: "viewer@acme.dev", image: null }],
      ["u_other", { id: "u_other", name: "Outside", email: "other@other.dev", image: null }],
    ]),
    workspaces: new Map([
      [
        "ws_1",
        {
          id: "ws_1",
          organizationId: "org_1",
          projectId: "proj_1",
          projectRepositoryId: "repo_1",
          ownerId: "u_owner",
          taskId: "task_1",
          name: "main-ws",
          status: "ACTIVE",
          storageMode: "EPHEMERAL",
          storageWarning: null,
          repoFullName: "acme/app",
          baseBranch: "main",
          baseCommitSha: "abc1234",
          currentBranch: "main",
          lastCommitSha: "abc1234",
          workspacePathKey: "ws_key_1",
          dirtyFileCount: 0,
          errorCode: null,
          errorMessage: null,
          lastActiveAt: new Date(),
          suspendedAt: null,
          stoppedAt: null,
          expiresAt: null,
          deletedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ]),
    tasks: new Map([
      [
        "task_1",
        {
          id: "task_1",
          organizationId: "org_1",
          projectId: "proj_1",
          identifier: "ACME-1",
          title: "Improve greeting validation",
          description: "Reject empty names safely",
          status: "IN_PROGRESS",
          archivedAt: null,
        },
      ],
    ]),
    collabSessions: new Map(),
    collabParticipants: [],
    collabMessages: [],
    aiConversations: new Map(),
    aiMessages: [],
    aiUsage: [],
    workspaceEvents: [],
    taskActivities: [],
  };

  const prisma = {
    $transaction: async (fn) => fn(prisma),
    organizationMembership: {
      findMany: async ({ where }) => {
        if (where?.organizationId !== "org_1") return [];
        return [{ user: state.users.get("u_owner") }];
      },
    },
    projectRoleAssignment: {
      findMany: async ({ where }) => {
        if (where?.projectId !== "proj_1") return [];
        return [
          { user: state.users.get("u_editor") },
          { user: state.users.get("u_viewer") },
        ];
      },
    },
    devWorkspace: {
      findFirst: async ({ where }) => {
        const ws = state.workspaces.get(where.id);
        if (!ws || ws.organizationId !== where.organizationId || ws.projectId !== where.projectId) {
          return null;
        }
        return {
          ...ws,
          owner: state.users.get(ws.ownerId),
          snapshots: [],
          events: [],
        };
      },
      update: async ({ where, data }) => {
        const ws = state.workspaces.get(where.id);
        Object.assign(ws, data);
        return ws;
      },
    },
    task: {
      findFirst: async ({ where }) => {
        const t = state.tasks.get(where.id);
        if (!t || t.organizationId !== where.organizationId || t.projectId !== where.projectId) return null;
        return t;
      },
    },
    pullRequest: { findFirst: async () => null },
    collabSession: {
      findFirst: async ({ where }) => {
        for (const s of state.collabSessions.values()) {
          if (where.id && s.id !== where.id) continue;
          if (where.workspaceId && s.workspaceId !== where.workspaceId) continue;
          if (where.organizationId && s.organizationId !== where.organizationId) continue;
          if (where.projectId && s.projectId !== where.projectId) continue;
          if (where.status && s.status !== where.status) continue;
          return {
            ...s,
            workspace: state.workspaces.get(s.workspaceId),
            task: s.taskId ? state.tasks.get(s.taskId) : null,
            createdBy: state.users.get(s.createdById),
            participants: state.collabParticipants
              .filter((p) => p.sessionId === s.id)
              .map((p) => ({ ...p, user: state.users.get(p.userId) })),
            documents: [],
            messages: state.collabMessages
              .filter((m) => m.sessionId === s.id)
              .map((m) => ({ ...m, author: state.users.get(m.authorId) ?? null })),
          };
        }
        return null;
      },
      findMany: async ({ where }) => {
        const out = [];
        for (const s of state.collabSessions.values()) {
          if (s.organizationId !== where.organizationId || s.projectId !== where.projectId) continue;
          const isPart = state.collabParticipants.some(
            (p) => p.sessionId === s.id && p.userId === "u_editor" && p.status !== "REMOVED",
          );
          if (s.createdById !== "u_owner" && !isPart) continue;
          out.push({
            ...s,
            workspace: state.workspaces.get(s.workspaceId),
            task: s.taskId ? state.tasks.get(s.taskId) : null,
            createdBy: state.users.get(s.createdById),
            participants: state.collabParticipants.filter((p) => p.sessionId === s.id && p.status === "ACTIVE"),
            _count: {
              participants: state.collabParticipants.filter((p) => p.sessionId === s.id && p.status === "ACTIVE").length,
            },
          });
        }
        return out;
      },
      create: async ({ data }) => {
        const s = {
          id: nextId("csess"),
          ...data,
          lastActivityAt: new Date(),
          closedAt: null,
          closedById: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.collabSessions.set(s.id, s);
        return s;
      },
      update: async ({ where, data }) => {
        const s = state.collabSessions.get(where.id);
        Object.assign(s, data, { updatedAt: new Date() });
        return s;
      },
    },
    collabParticipant: {
      findFirst: async ({ where }) => {
        const row = state.collabParticipants.find((p) => {
          if (where.userId && p.userId !== where.userId) return false;
          if (where.status && p.status !== where.status) return false;
          if (where.sessionId && p.sessionId !== where.sessionId) return false;
          if (where.session) {
            const s = state.collabSessions.get(p.sessionId);
            if (!s || (where.session.workspaceId && s.workspaceId !== where.session.workspaceId)) return false;
            if (where.session.status && s.status !== where.session.status) return false;
          }
          return true;
        });
        return row ? { ...row, user: state.users.get(row.userId) } : null;
      },
      findUnique: async ({ where }) => {
        const row = state.collabParticipants.find(
          (p) => p.sessionId === where.sessionId_userId.sessionId && p.userId === where.sessionId_userId.userId,
        );
        return row ?? null;
      },
      findMany: async ({ where }) =>
        state.collabParticipants.filter(
          (p) => p.userId === where.userId && (!where.sessionId?.in || where.sessionId.in.includes(p.sessionId)),
        ),
      createMany: async ({ data }) => {
        for (const item of data) {
          state.collabParticipants.push({
            id: nextId("cpart"),
            ...item,
            joinedAt: new Date(),
            leftAt: null,
            revokedAt: null,
            revokedReason: null,
            lastSeenAt: new Date(),
          });
        }
      },
      create: async ({ data }) => {
        const row = {
          id: nextId("cpart"),
          ...data,
          joinedAt: new Date(),
          leftAt: null,
          revokedAt: null,
          revokedReason: null,
          lastSeenAt: new Date(),
        };
        state.collabParticipants.push(row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.collabParticipants.find((p) => p.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
    collabMessage: {
      create: async ({ data }) => {
        const m = { id: nextId("cmsg"), ...data, createdAt: new Date() };
        state.collabMessages.push(m);
        return { ...m, author: state.users.get(m.authorId) ?? null };
      },
    },
    aiConversation: {
      findMany: async ({ where }) =>
        Array.from(state.aiConversations.values())
          .filter(
            (c) =>
              c.organizationId === where.organizationId &&
              c.projectId === where.projectId &&
              c.userId === where.userId &&
              !c.archivedAt,
          )
          .map((c) => ({
            ...c,
            _count: { messages: state.aiMessages.filter((m) => m.conversationId === c.id).length },
          })),
      findFirst: async ({ where }) => {
        const c = state.aiConversations.get(where.id);
        if (!c || c.organizationId !== where.organizationId || c.projectId !== where.projectId || c.archivedAt) {
          return null;
        }
        return {
          ...c,
          messages: state.aiMessages
            .filter((m) => m.conversationId === c.id)
            .map((m) => ({ ...m, author: m.authorId ? state.users.get(m.authorId) ?? null : null })),
        };
      },
      create: async ({ data }) => {
        const c = {
          id: nextId("conv"),
          ...data,
          isSharedWithSession: false,
          archivedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.aiConversations.set(c.id, c);
        return { ...c, messages: [] };
      },
      update: async ({ where, data }) => {
        const c = state.aiConversations.get(where.id);
        Object.assign(c, data);
        return c;
      },
    },
    aiMessage: {
      create: async ({ data }) => {
        const m = {
          id: nextId("aimsg"),
          errorMessage: null,
          attachedContext: null,
          citations: [],
          proposalJson: null,
          provider: null,
          model: null,
          inputTokens: 0,
          outputTokens: 0,
          latencyMs: 0,
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        state.aiMessages.push(m);
        return { ...m, author: m.authorId ? state.users.get(m.authorId) ?? null : null };
      },
      update: async ({ where, data }) => {
        const m = state.aiMessages.find((x) => x.id === where.id);
        Object.assign(m, data, { updatedAt: new Date() });
        return { ...m, author: m.authorId ? state.users.get(m.authorId) ?? null : null };
      },
    },
    aiAssistantUsageRecord: {
      aggregate: async () => ({
        _sum: {
          inputTokens: state.aiUsage.reduce((a, b) => a + b.inputTokens, 0),
          outputTokens: state.aiUsage.reduce((a, b) => a + b.outputTokens, 0),
          estimatedCostUsd: 0.0012,
        },
      }),
      create: async ({ data }) => {
        const rec = { id: nextId("aiuse"), ...data, createdAt: new Date() };
        state.aiUsage.push(rec);
        return rec;
      },
    },
    workspaceEvent: {
      create: async ({ data }) => {
        state.workspaceEvents.push(data);
        return data;
      },
    },
    taskActivity: {
      create: async ({ data }) => {
        state.taskActivities.push(data);
        return data;
      },
    },
  };

  return { prisma, state };
}

function projContext(role, canRunAi = true) {
  return {
    project: {
      id: "proj_1",
      organizationId: "org_1",
      name: "Acme App",
      key: "ACME",
      slug: "acme",
      description: null,
      status: "ACTIVE",
      allowDeveloperAiRuns: true,
      createdById: "u_owner",
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    projectRole: role,
    canManage: role === "PROJECT_MANAGER" || role === "OWNER",
    canRunAi,
  };
}

test("CollabService RBAC, private invitation boundaries, viewer read-only enforcement, revocation invalidation, and terminal isolation", async () => {
  const { prisma } = createBrick8MockDb();
  process.env.INTERNAL_AUTH_SECRET = "test-secret-brick8-minimum-32-chars-long";

  const workerCalls = [];
  const worker = new WorkerClientService();
  worker.setTransportForTesting({
    async request(url, init) {
      workerCalls.push({ url, method: init.method, body: init.body });
      if (url.endsWith("/capabilities")) {
        return {
          status: 200,
          text: JSON.stringify({
            workerConfigured: true,
            workerReachable: true,
            workerReason: "ok",
            gitAvailable: true,
            sandboxAvailable: false,
            sandboxReason: "no docker",
            terminalAvailable: false,
            terminalReason: "no docker",
            storageMode: "EPHEMERAL",
            maxFileBytes: 65536,
          }),
        };
      }
      if (url.includes("/file")) {
        return {
          status: 200,
          text: JSON.stringify({
            path: "src/app.ts",
            name: "app.ts",
            content: "export const v = 1;",
            size: 19,
            versionHash: "hash1",
            isBinary: false,
            isTooLarge: false,
            language: "typescript",
          }),
        };
      }
      return { status: 200, text: JSON.stringify({ ok: true }) };
    },
  });

  const collabService = new CollabService({ prisma }, worker);
  const wsService = new WorkspacesService(
    { prisma },
    worker,
    new GitHubConfigService(),
    new GitHubAppClientService(new GitHubConfigService()),
  );

  // Before starting collab session, single-user workspace blocks other developers
  await assert.rejects(
    () => wsService.readFile("u_editor", "org_1", "proj_1", "ws_1", projContext("DEVELOPER"), "src/app.ts"),
    /single-user development workspace belongs to another/,
  );

  // Start private collab session & invite u_editor
  const created = await collabService.createSession("u_owner", "org_1", "proj_1", "ws_1", projContext("OWNER"), {
    title: "Pair debug",
    inviteeIds: ["u_editor"],
  });
  assert.equal(created.participants.length, 2);

  // Uninvited u_viewer cannot access private session
  await assert.rejects(
    () => collabService.getSessionDetail("u_viewer", "org_1", "proj_1", created.id, projContext("DEVELOPER")),
    /private and you have not been invited/,
  );

  // Non-project/unassigned user cannot be invited
  await assert.rejects(
    () =>
      collabService.inviteParticipant("u_owner", "org_1", "proj_1", created.id, projContext("OWNER"), {
        userId: "u_other",
        role: "EDITOR",
      }),
    /active project developer/,
  );

  // Invite u_viewer as VIEWER -> can read workspace files, CANNOT write files, CANNOT open terminal!
  await collabService.inviteParticipant("u_owner", "org_1", "proj_1", created.id, projContext("OWNER"), {
    userId: "u_viewer",
    role: "VIEWER",
  });
  const readOk = await wsService.readFile("u_viewer", "org_1", "proj_1", "ws_1", projContext("DEVELOPER"), "src/app.ts");
  assert.equal(readOk.path, "src/app.ts");

  await assert.rejects(
    () =>
      wsService.writeFile("u_viewer", "org_1", "proj_1", "ws_1", projContext("DEVELOPER"), {
        path: "src/app.ts",
        content: "nope",
      }),
    /Read-only viewer role cannot modify/,
  );

  await assert.rejects(
    () => wsService.createTerminalSession("u_editor", "org_1", "proj_1", "ws_1", projContext("DEVELOPER")),
    /strictly restricted to the workspace owner/,
  );

  // Post discussion message
  const chatMsg = await collabService.postMessage("u_editor", "org_1", "proj_1", created.id, projContext("DEVELOPER"), {
    body: "Checking line 12 cleanly",
    filePath: "src/app.ts",
    lineNumber: 12,
  });
  assert.equal(chatMsg.lineNumber, 12);

  // Revoke u_editor -> calls worker revoke AND immediately blocks HTTP detail + ticket issuance
  await collabService.revokeParticipant("u_owner", "org_1", "proj_1", created.id, "u_editor", projContext("OWNER"));
  assert.ok(workerCalls.some((c) => c.url.endsWith(`/collab/sessions/${created.id}/revoke`)));
  await assert.rejects(
    () => collabService.issueWsTicket("u_editor", "org_1", "proj_1", created.id, projContext("DEVELOPER")),
    /PERMISSION_REVOKED/,
  );
});

test("AiAssistantService refuses unconfigured AI, streams SSE with citations/proposal, cancels cleanly, blocks stale patch conflicts, and protects private chats", async () => {
  const { prisma, state } = createBrick8MockDb();
  process.env.INTERNAL_AUTH_SECRET = "test-secret-brick8-minimum-32-chars-long";

  const srcText = "export function greet(name: string) {\n  return `Hi ${name}`;\n}\n";
  const srcHash = createHash("sha256").update(srcText, "utf8").digest("hex");

  const worker = new WorkerClientService();
  let simulateConflict = false;
  worker.setTransportForTesting({
    async request(url) {
      if (url.includes("/file") && url.includes(".env")) {
        throw new Error("should never read .env");
      }
      if (url.includes("/file")) {
        return {
          status: 200,
          text: JSON.stringify({
            path: "src/app.ts",
            name: "app.ts",
            content: srcText,
            size: srcText.length,
            versionHash: srcHash,
            isBinary: false,
            isTooLarge: false,
            language: "typescript",
          }),
        };
      }
      if (url.includes("/git/diff")) {
        return { status: 200, text: JSON.stringify({ rawDiff: "", files: [] }) };
      }
      if (url.includes("/apply-patch")) {
        if (simulateConflict) {
          return {
            status: 409,
            text: JSON.stringify({
              message: "Cannot apply AI patch cleanly because src/app.ts changed concurrently.",
              code: "PATCH_CONFLICT",
            }),
          };
        }
        return {
          status: 200,
          text: JSON.stringify({ filesChanged: 1, appliedPaths: ["src/app.ts"], deletedPaths: [], status: {} }),
        };
      }
      return { status: 200, text: "{}" };
    },
  });

  // 1. Unconfigured AI fails honestly (zero fabricated response)
  const unconfiguredAi = new AiConfigService({
    get: () => ({
      provider: null,
      model: null,
      apiKey: null,
      apiBaseUrl: undefined,
      timeoutMs: 5000,
      priceInputPer1m: 0,
      priceOutputPer1m: 0,
      sandboxEnabled: false,
      sandboxDockerImage: "node:24-alpine",
    }),
  });
  const unconfService = new AiAssistantService({ prisma }, unconfiguredAi, worker);
  const st0 = await unconfService.getStatus("org_1", "proj_1", "u_owner", projContext("OWNER"));
  assert.equal(st0.configured, false);
  const conv = await unconfService.createConversation("u_owner", "org_1", "proj_1", projContext("OWNER"), {
    workspaceId: "ws_1",
    taskId: "task_1",
  });
  await assert.rejects(
    () =>
      unconfService.streamMessage({
        actorUserId: "u_owner",
        orgId: "org_1",
        projectId: "proj_1",
        conversationId: conv.id,
        projectContext: projContext("OWNER"),
        body: { prompt: "Explain code" },
        signal: new AbortController().signal,
        emit: () => {},
      }),
    /not configured/,
  );

  // 2. Private conversation boundary: u_editor cannot read u_owner's private AI conversation
  await assert.rejects(
    () => unconfService.getConversationDetail("u_editor", "org_1", "proj_1", conv.id),
    /private to their creator/,
  );

  // 3. Configured real SSE streaming + secret exclusion + citation + patch extraction + cancellation
  const mockDiffReply = [
    "Look at `src/app.ts:1-3`. We should validate `name`.",
    "```diff",
    "diff --git a/src/app.ts b/src/app.ts",
    "--- a/src/app.ts",
    "+++ b/src/app.ts",
    "@@ -1,3 +1,4 @@",
    " export function greet(name: string) {",
    "+  if (!name.trim()) throw new Error('name required');",
    "   return `Hi ${name}`;",
    " }",
    "```",
  ].join("\n");

  const providerClient = new AiProviderClient({
    provider: "openai-compatible",
    model: "test-model",
    apiKey: "sk-test-secret-value-1234",
    apiBaseUrl: "http://localhost:9999/v1",
    timeoutMs: 5000,
    priceInputPer1m: 1,
    priceOutputPer1m: 2,
  });

  providerClient.setTransportForTesting({
    async postJson() {
      throw new Error("unused");
    },
    async streamPost(_url, _headers, body) {
      assert.equal(body.stream, true);
      const half = Math.floor(mockDiffReply.length / 2);
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: mockDiffReply.slice(0, half) } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: mockDiffReply.slice(half) } }], usage: { prompt_tokens: 120, completion_tokens: 45 } })}\n\n`,
        "data: [DONE]\n\n",
      ];
      return {
        status: 200,
        headers: { get: () => "text/event-stream" },
        body: makeSseReadableStream(chunks, 5),
      };
    },
  });

  const configuredAi = new AiConfigService({
    get: () => ({
      provider: "openai-compatible",
      model: "test-model",
      apiKey: "sk-test-secret-value-1234",
      apiBaseUrl: "http://localhost:9999/v1",
      timeoutMs: 5000,
      priceInputPer1m: 1,
      priceOutputPer1m: 2,
      sandboxEnabled: false,
      sandboxDockerImage: "node:24-alpine",
    }),
  });
  configuredAi.createProviderClient = () => providerClient;

  const assistant = new AiAssistantService({ prisma }, configuredAi, worker);
  const emitted = [];
  await assistant.streamMessage({
    actorUserId: "u_owner",
    orgId: "org_1",
    projectId: "proj_1",
    conversationId: conv.id,
    projectContext: projContext("OWNER"),
    body: {
      prompt: "Check greeting function",
      actionKind: "IMPROVE",
      workspaceId: "ws_1",
      activeFilePath: "src/app.ts",
      attachedPaths: [".env", "src/app.ts"],
      selectedText: "export function greet",
      selectionStartLine: 1,
      selectionEndLine: 1,
    },
    signal: new AbortController().signal,
    emit: (e) => emitted.push(e),
  });

  const contextEvt = emitted.find((e) => e.type === "context");
  assert.equal(contextEvt.attachedContext.excludedSensitiveCount, 1);
  assert.ok(contextEvt.attachedContext.includedFiles.some((f) => f.path === "src/app.ts"));

  const doneEvt = emitted.find((e) => e.type === "done");
  assert.ok(doneEvt, "Expected SSE done event");
  assert.equal(doneEvt.message.citations[0].filePath, "src/app.ts");
  assert.ok(doneEvt.message.proposal);
  assert.equal(doneEvt.message.proposal.baseFileHashes["src/app.ts"], srcHash);
  assert.equal(state.aiUsage.length, 1);
  assert.equal(state.aiUsage[0].totalTokens, 165);

  // 4. Stale/conflict check rejects patch when collaborator modified target file
  simulateConflict = true;
  await assert.rejects(
    () =>
      assistant.applyAssistantProposal(
        "u_owner",
        "org_1",
        "proj_1",
        conv.id,
        doneEvt.message.id,
        projContext("OWNER"),
      ),
    /changed concurrently/,
  );

  // Succeeds when base hashes match cleanly
  simulateConflict = false;
  const applied = await assistant.applyAssistantProposal(
    "u_owner",
    "org_1",
    "proj_1",
    conv.id,
    doneEvt.message.id,
    projContext("OWNER"),
  );
  assert.equal(applied.filesChanged, 1);
  assert.ok(applied.message.proposal.appliedAt);

  // Cannot apply twice
  await assert.rejects(
    () =>
      assistant.applyAssistantProposal(
        "u_owner",
        "org_1",
        "proj_1",
        conv.id,
        doneEvt.message.id,
        projContext("OWNER"),
      ),
    /already been applied/,
  );

  // 5. Cancellation aborts mid-stream cleanly
  const abortCtrl = new AbortController();
  providerClient.setTransportForTesting({
    async postJson() {
      throw new Error("unused");
    },
    async streamPost() {
      const chunks = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial..." } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Never reaches" } }] })}\n\n`,
      ];
      return { status: 200, headers: { get: () => "text/event-stream" }, body: makeSseReadableStream(chunks, 80) };
    },
  });
  const cancelEvents = [];
  const streamPromise = assistant.streamMessage({
    actorUserId: "u_owner",
    orgId: "org_1",
    projectId: "proj_1",
    conversationId: conv.id,
    projectContext: projContext("OWNER"),
    body: { prompt: "Explain slowly" },
    signal: abortCtrl.signal,
    emit: (e) => {
      cancelEvents.push(e);
      if (e.type === "delta") abortCtrl.abort();
    },
  });
  await streamPromise;
  assert.ok(cancelEvents.some((e) => e.type === "error" && e.status === "CANCELLED"));
  assert.ok(AiProviderError);
  assert.ok(extractAssistantCitations("Look at `src/app.ts:2`", ["src/app.ts"]).length === 1);
  assert.ok(extractAssistantPatchProposal(mockDiffReply));
});
