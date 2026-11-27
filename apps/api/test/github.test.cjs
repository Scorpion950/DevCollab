const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHmac, generateKeyPairSync } = require("node:crypto");

const { AuthorizationService } = require("../dist/authorization/authorization.service");
const { ProjectAccessGuard } = require("../dist/authorization/project-access.guard");
const { OrganizationsService } = require("../dist/organizations/organizations.service");
const { InvitationsService } = require("../dist/invitations/invitations.service");
const { ProjectsService } = require("../dist/projects/projects.service");
const { TasksService } = require("../dist/tasks/tasks.service");
const { GitHubConfigService } = require("../dist/github/github-config.service");
const { GitHubAppClientService } = require("../dist/github/github-app-client.service");
const { GitHubService } = require("../dist/github/github.service");

const { privateKey: TEST_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

function createGitHubTestEnv(options = {}) {
  let seq = 1;
  const nextId = (prefix) => `${prefix}_${seq++}`;
  const state = {
    users: new Map(),
    organizations: new Map(),
    memberships: new Map(),
    invitations: new Map(),
    projects: new Map(),
    projectRoles: new Map(),
    auditLogs: [],
    tasks: new Map(),
    comments: new Map(),
    activities: [],
    installations: new Map(),
    orgInstallations: new Map(),
    installSessions: new Map(),
    projectRepos: new Map(),
    pullRequests: new Map(),
    prComments: new Map(),
    prReviews: new Map(),
    taskPrLinks: new Map(),
    webhookDeliveries: new Map(),
  };

  function membershipByOrgUser(orgId, userId) {
    for (const m of state.memberships.values()) {
      if (m.organizationId === orgId && m.userId === userId) return m;
    }
    return null;
  }

  function projectRoleByProjectUser(projectId, userId) {
    for (const r of state.projectRoles.values()) {
      if (r.projectId === projectId && r.userId === userId) return r;
    }
    return null;
  }

  function matchPullRequestWhere(pr, where = {}) {
    if (where.id && pr.id !== where.id) return false;
    if (where.projectRepositoryId && pr.projectRepositoryId !== where.projectRepositoryId) return false;
    if (where.organizationId && pr.organizationId !== where.organizationId) return false;
    if (where.projectId && pr.projectId !== where.projectId) return false;
    if (where.number !== undefined && pr.number !== where.number) return false;
    if (where.state && pr.state !== where.state) return false;
    if (where.isDraft !== undefined && pr.isDraft !== where.isDraft) return false;
    if (Array.isArray(where.OR)) {
      const ok = where.OR.some((clause) => {
        if (clause.number !== undefined && pr.number === clause.number) return true;
        if (clause.title?.contains && pr.title.toLowerCase().includes(clause.title.contains.toLowerCase())) return true;
        if (clause.headRef?.contains && pr.headRef.toLowerCase().includes(clause.headRef.contains.toLowerCase())) return true;
        if (clause.baseRef?.contains && pr.baseRef.toLowerCase().includes(clause.baseRef.contains.toLowerCase())) return true;
        if (clause.authorLogin?.contains && pr.authorLogin.toLowerCase().includes(clause.authorLogin.contains.toLowerCase())) return true;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  }

  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id) return state.users.get(where.id) ?? null;
        if (where.email) {
          for (const u of state.users.values()) if (u.email === where.email) return u;
        }
        return null;
      },
    },
    organization: {
      findUnique: async ({ where }) => {
        if (where.id) return state.organizations.get(where.id) ?? null;
        if (where.slug) {
          for (const o of state.organizations.values()) if (o.slug === where.slug) return o;
        }
        return null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const org = { id: nextId("org"), description: null, ...data, createdAt: now, updatedAt: now };
        state.organizations.set(org.id, org);
        return org;
      },
    },
    organizationMembership: {
      findUnique: async ({ where, include }) => {
        const k = where.organizationId_userId;
        const m = k ? membershipByOrgUser(k.organizationId, k.userId) : state.memberships.get(where.id) ?? null;
        if (!m) return null;
        return {
          ...m,
          organization: include?.organization
            ? { ...state.organizations.get(m.organizationId), _count: { memberships: 1, projects: 1 } }
            : undefined,
          user: include?.user ? state.users.get(m.userId) : undefined,
        };
      },
      findMany: async ({ where, include }) => {
        return [...state.memberships.values()]
          .filter((m) => (!where.organizationId || m.organizationId === where.organizationId) && (!where.status || m.status === where.status))
          .map((m) => ({ ...m, user: include?.user ? state.users.get(m.userId) : undefined }));
      },
      create: async ({ data, include }) => {
        const now = new Date();
        const m = { id: nextId("mem"), status: "ACTIVE", ...data, joinedAt: now, updatedAt: now };
        state.memberships.set(m.id, m);
        const out = { ...m };
        if (include?.organization) {
          out.organization = { ...state.organizations.get(m.organizationId), _count: { memberships: 1, projects: 1 } };
        }
        return out;
      },
    },
    organizationInvitation: {
      findUnique: async ({ where, include }) => {
        for (const inv of state.invitations.values()) {
          if (inv.tokenHash === where.tokenHash) {
            return { ...inv, organization: include?.organization ? state.organizations.get(inv.organizationId) : undefined };
          }
        }
        return null;
      },
      findFirst: async () => null,
      create: async ({ data, include }) => {
        const now = new Date();
        const inv = { id: nextId("inv"), acceptedAt: null, revokedAt: null, acceptedById: null, ...data, createdAt: now, updatedAt: now };
        state.invitations.set(inv.id, inv);
        return { ...inv, invitedBy: include?.invitedBy ? state.users.get(inv.invitedById) : null };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const inv of state.invitations.values()) {
          if (where.id && inv.id !== where.id) continue;
          if (where.status && inv.status !== where.status) continue;
          Object.assign(inv, data);
          count++;
        }
        return { count };
      },
    },
    project: {
      findUnique: async () => null,
      findUniqueOrThrow: async ({ where, include }) => prisma.project.findFirst({ where, include }),
      findFirst: async ({ where, include }) => {
        for (const p of state.projects.values()) {
          if (where.id && p.id !== where.id) continue;
          if (where.organizationId && p.organizationId !== where.organizationId) continue;
          const out = { ...p };
          if (include?.createdBy) out.createdBy = p.createdById ? state.users.get(p.createdById) ?? null : null;
          if (include?.roleAssignments) {
            out.roleAssignments = [...state.projectRoles.values()]
              .filter((r) => r.projectId === p.id)
              .map((r) => ({ ...r, user: state.users.get(r.userId) }));
          }
          return out;
        }
        return null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const p = { id: nextId("prj"), nextTaskNumber: 1, archivedAt: null, ...data, createdAt: now, updatedAt: now };
        state.projects.set(p.id, p);
        return { ...p };
      },
      update: async ({ where, data }) => {
        const p = state.projects.get(where.id);
        if (data.nextTaskNumber?.increment) p.nextTaskNumber += data.nextTaskNumber.increment;
        else Object.assign(p, data);
        p.updatedAt = new Date();
        return { ...p };
      },
    },
    projectRoleAssignment: {
      findUnique: async ({ where }) => {
        const k = where.projectId_userId;
        return k ? projectRoleByProjectUser(k.projectId, k.userId) : null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const r = { id: nextId("prl"), ...data, createdAt: now, updatedAt: now };
        state.projectRoles.set(r.id, r);
        return r;
      },
      upsert: async ({ where, update, create }) => {
        const existing = projectRoleByProjectUser(where.projectId_userId.projectId, where.projectId_userId.userId);
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        return prisma.projectRoleAssignment.create({ data: create });
      },
    },
    organizationAuditLog: {
      create: async ({ data }) => {
        const row = { id: nextId("aud"), projectId: null, actorId: null, ...data, createdAt: new Date() };
        state.auditLogs.push(row);
        return row;
      },
    },
    task: {
      findFirst: async ({ where, include }) => {
        for (const t of state.tasks.values()) {
          if (where.id && t.id !== where.id) continue;
          if (where.projectId && t.projectId !== where.projectId) continue;
          if (where.organizationId && t.organizationId !== where.organizationId) continue;
          return {
            ...t,
            project: include?.project ? state.projects.get(t.projectId) : undefined,
            assignee: include?.assignee && t.assigneeId ? state.users.get(t.assigneeId) ?? null : null,
            creator: include?.creator && t.creatorId ? state.users.get(t.creatorId) ?? null : null,
            _count: { comments: 0 },
            comments: [],
            activities: state.activities
              .filter((a) => a.taskId === t.id)
              .slice()
              .reverse()
              .map((a) => ({ ...a, actor: a.actorId ? state.users.get(a.actorId) ?? null : null })),
          };
        }
        return null;
      },
      create: async ({ data }) => {
        const now = new Date();
        const t = { id: nextId("tsk"), archivedAt: null, completedAt: null, ...data, createdAt: now, updatedAt: now };
        state.tasks.set(t.id, t);
        return t;
      },
      updateMany: async () => ({ count: 0 }),
      groupBy: async () => [],
      count: async () => 0,
      findMany: async () => [],
    },
    taskActivity: {
      create: async ({ data }) => {
        const row = { id: nextId("act"), field: null, oldValue: null, newValue: null, ...data, createdAt: new Date() };
        state.activities.push(row);
        return row;
      },
    },
    gitHubAppInstallation: {
      findUnique: async ({ where }) => {
        if (where.githubInstallationId) {
          for (const i of state.installations.values()) if (i.githubInstallationId === where.githubInstallationId) return i;
        }
        return state.installations.get(where.id) ?? null;
      },
      upsert: async ({ where, create, update }) => {
        const existing = await prisma.gitHubAppInstallation.findUnique({ where });
        const now = new Date();
        if (existing) {
          Object.assign(existing, update, { updatedAt: now });
          return existing;
        }
        const row = { id: nextId("ghi"), suspendedAt: null, deletedAt: null, ...create, createdAt: now, updatedAt: now };
        state.installations.set(row.id, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.installations.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return row;
      },
    },
    organizationGitHubInstallation: {
      findMany: async ({ where, include }) => {
        return [...state.orgInstallations.values()]
          .filter((l) => {
            if (where.organizationId && l.organizationId !== where.organizationId) return false;
            const inst = state.installations.get(l.installationId);
            if (where.installation?.status?.not && inst?.status === where.installation.status.not) return false;
            return true;
          })
          .map((l) => ({ ...l, installation: include?.installation ? state.installations.get(l.installationId) : undefined }));
      },
      findFirst: async ({ where, include }) => {
        for (const l of state.orgInstallations.values()) {
          if (where.organizationId && l.organizationId !== where.organizationId) continue;
          const inst = state.installations.get(l.installationId);
          if (where.installation?.githubInstallationId && inst?.githubInstallationId !== where.installation.githubInstallationId) continue;
          return { ...l, installation: include?.installation ? inst : undefined };
        }
        return null;
      },
      upsert: async ({ where, create, update }) => {
        const k = where.organizationId_installationId;
        for (const l of state.orgInstallations.values()) {
          if (l.organizationId === k.organizationId && l.installationId === k.installationId) {
            Object.assign(l, update);
            return l;
          }
        }
        const row = { id: nextId("ogi"), ...create, createdAt: new Date() };
        state.orgInstallations.set(row.id, row);
        return row;
      },
    },
    gitHubInstallSession: {
      create: async ({ data }) => {
        const row = { id: nextId("gis"), consumedAt: null, ...data, createdAt: new Date() };
        state.installSessions.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }) => {
        for (const s of state.installSessions.values()) if (s.stateHash === where.stateHash) return s;
        return null;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const s of state.installSessions.values()) {
          if (where.id && s.id !== where.id) continue;
          if (where.consumedAt === null && s.consumedAt !== null) continue;
          Object.assign(s, data);
          count++;
        }
        return { count };
      },
    },
    projectRepository: {
      findFirst: async ({ where, include }) => {
        const matches = [...state.projectRepos.values()].filter((r) => {
          if (where.projectId && r.projectId !== where.projectId) return false;
          if (where.organizationId && r.organizationId !== where.organizationId) return false;
          if (where.status?.not && r.status === where.status.not) return false;
          return true;
        });
        const row = matches[matches.length - 1] ?? null;
        if (!row) return null;
        return { ...row, installation: include?.installation ? state.installations.get(row.installationId) : undefined };
      },
      findMany: async ({ where, include }) => {
        return [...state.projectRepos.values()]
          .filter((r) => {
            if (where.githubRepoId && r.githubRepoId !== where.githubRepoId) return false;
            if (where.status && typeof where.status === "string" && r.status !== where.status) return false;
            if (where.installation?.githubInstallationId) {
              const inst = state.installations.get(r.installationId);
              if (inst?.githubInstallationId !== where.installation.githubInstallationId) return false;
            }
            return true;
          })
          .map((r) => ({ ...r, installation: include?.installation ? state.installations.get(r.installationId) : undefined }));
      },
      create: async ({ data, include }) => {
        const now = new Date();
        for (const r of state.projectRepos.values()) {
          if (data.activeLock && r.projectId === data.projectId && r.activeLock === data.activeLock) {
            throw Object.assign(new Error("Unique"), { code: "P2002" });
          }
        }
        const row = {
          id: nextId("prp"),
          openPrCount: 0,
          lastSyncedAt: null,
          disconnectedAt: null,
          ...data,
          connectedAt: now,
          createdAt: now,
          updatedAt: now,
        };
        state.projectRepos.set(row.id, row);
        return { ...row, installation: include?.installation ? state.installations.get(row.installationId) : undefined };
      },
      update: async ({ where, data }) => {
        const row = state.projectRepos.get(where.id);
        Object.assign(row, data, { updatedAt: new Date() });
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const r of state.projectRepos.values()) {
          if (where.installationId && r.installationId !== where.installationId) continue;
          if (where.githubRepoId?.in && !where.githubRepoId.in.includes(r.githubRepoId)) continue;
          if (where.status?.in && !where.status.in.includes(r.status)) continue;
          if (where.status?.not && r.status === where.status.not) continue;
          if (typeof where.status === "string" && r.status !== where.status) continue;
          Object.assign(r, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
    pullRequest: {
      upsert: async ({ where, create, update }) => {
        const k = where.projectRepositoryId_number;
        for (const pr of state.pullRequests.values()) {
          if (pr.projectRepositoryId === k.projectRepositoryId && pr.number === k.number) {
            Object.assign(pr, update, { updatedAt: new Date() });
            return { ...pr };
          }
        }
        const now = new Date();
        const row = { id: nextId("ghpr"), ...create, createdAt: now, updatedAt: now };
        state.pullRequests.set(row.id, row);
        return { ...row };
      },
      count: async ({ where }) => {
        return [...state.pullRequests.values()].filter((pr) => matchPullRequestWhere(pr, where)).length;
      },
      findMany: async ({ where }) => {
        return [...state.pullRequests.values()]
          .filter((pr) => matchPullRequestWhere(pr, where))
          .map((pr) => ({
            ...pr,
            _count: {
              reviewComments: [...state.prComments.values()].filter((c) => c.pullRequestId === pr.id).length,
              taskLinks: [...state.taskPrLinks.values()].filter((l) => l.pullRequestId === pr.id).length,
            },
          }));
      },
      findFirst: async ({ where }) => {
        for (const pr of state.pullRequests.values()) {
          if (!matchPullRequestWhere(pr, where)) continue;
          return {
            ...pr,
            project: state.projects.get(pr.projectId),
            _count: {
              reviewComments: [...state.prComments.values()].filter((c) => c.pullRequestId === pr.id).length,
              taskLinks: [...state.taskPrLinks.values()].filter((l) => l.pullRequestId === pr.id).length,
            },
          };
        }
        return null;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const pr of state.pullRequests.values()) {
          if (!matchPullRequestWhere(pr, where)) continue;
          Object.assign(pr, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
    pullRequestReviewComment: {
      create: async ({ data }) => {
        const now = new Date();
        const row = { id: nextId("prc"), status: "OPEN", resolvedById: null, resolvedAt: null, editedAt: null, ...data, createdAt: now, updatedAt: now };
        state.prComments.set(row.id, row);
        return {
          ...row,
          author: row.authorId ? state.users.get(row.authorId) ?? null : null,
          resolvedBy: null,
        };
      },
      findMany: async ({ where }) => {
        return [...state.prComments.values()]
          .filter((c) => c.pullRequestId === where.pullRequestId)
          .map((c) => ({
            ...c,
            author: c.authorId ? state.users.get(c.authorId) ?? null : null,
            resolvedBy: c.resolvedById ? state.users.get(c.resolvedById) ?? null : null,
          }));
      },
      findFirst: async ({ where }) => {
        for (const c of state.prComments.values()) {
          if (where.id && c.id !== where.id) continue;
          if (where.pullRequestId && c.pullRequestId !== where.pullRequestId) continue;
          if (where.projectId && c.projectId !== where.projectId) continue;
          if (where.organizationId && c.organizationId !== where.organizationId) continue;
          return c;
        }
        return null;
      },
      update: async ({ where, data }) => {
        const c = state.prComments.get(where.id);
        Object.assign(c, data, { updatedAt: new Date() });
        return {
          ...c,
          author: c.authorId ? state.users.get(c.authorId) ?? null : null,
          resolvedBy: c.resolvedById ? state.users.get(c.resolvedById) ?? null : null,
        };
      },
      delete: async ({ where }) => {
        const c = state.prComments.get(where.id);
        state.prComments.delete(where.id);
        return c;
      },
    },
    pullRequestInternalReview: {
      upsert: async ({ where, create, update }) => {
        const k = where.pullRequestId_reviewerId;
        for (const r of state.prReviews.values()) {
          if (r.pullRequestId === k.pullRequestId && r.reviewerId === k.reviewerId) {
            Object.assign(r, update, { updatedAt: new Date() });
            return { ...r, reviewer: state.users.get(r.reviewerId) ?? null };
          }
        }
        const now = new Date();
        const row = { id: nextId("prr"), ...create, createdAt: now, updatedAt: now };
        state.prReviews.set(row.id, row);
        return { ...row, reviewer: state.users.get(row.reviewerId) ?? null };
      },
      findMany: async ({ where }) => {
        return [...state.prReviews.values()]
          .filter((r) => r.pullRequestId === where.pullRequestId)
          .map((r) => ({ ...r, reviewer: state.users.get(r.reviewerId) ?? null }));
      },
    },
    taskPullRequestLink: {
      findUnique: async ({ where }) => {
        const k = where.taskId_pullRequestId;
        for (const l of state.taskPrLinks.values()) {
          if (l.taskId === k.taskId && l.pullRequestId === k.pullRequestId) return l;
        }
        return null;
      },
      create: async ({ data }) => {
        const row = { id: nextId("tpl"), ...data, createdAt: new Date() };
        state.taskPrLinks.set(row.id, row);
        return row;
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [id, l] of state.taskPrLinks.entries()) {
          if (where.taskId && l.taskId !== where.taskId) continue;
          if (where.pullRequestId && l.pullRequestId !== where.pullRequestId) continue;
          state.taskPrLinks.delete(id);
          count++;
        }
        return { count };
      },
      findMany: async ({ where }) => {
        return [...state.taskPrLinks.values()]
          .filter((l) => {
            if (where.taskId && l.taskId !== where.taskId) return false;
            if (where.pullRequestId && l.pullRequestId !== where.pullRequestId) return false;
            if (where.pullRequest?.projectRepository?.status) {
              const pr = state.pullRequests.get(l.pullRequestId);
              const repo = pr ? state.projectRepos.get(pr.projectRepositoryId) : null;
              if (repo?.status !== where.pullRequest.projectRepository.status) return false;
            }
            return true;
          })
          .map((l) => {
            const pr = state.pullRequests.get(l.pullRequestId);
            const repo = pr ? state.projectRepos.get(pr.projectRepositoryId) : null;
            const task = state.tasks.get(l.taskId);
            return {
              ...l,
              pullRequest: pr ? { ...pr, projectRepository: { fullName: repo?.fullName ?? "" } } : null,
              task: task ? { ...task, assignee: task.assigneeId ? state.users.get(task.assigneeId) ?? null : null } : null,
            };
          });
      },
    },
    gitHubWebhookDelivery: {
      create: async ({ data }) => {
        if (state.webhookDeliveries.has(data.deliveryId)) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        const row = { id: nextId("whd"), errorMessage: null, processedAt: null, ...data, receivedAt: new Date() };
        state.webhookDeliveries.set(data.deliveryId, row);
        return row;
      },
      update: async ({ where, data }) => {
        const row = state.webhookDeliveries.get(where.deliveryId);
        Object.assign(row, data);
        return row;
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const mockConfigService = new GitHubConfigService({
    get: () =>
      options.unconfigured
        ? { apiBaseUrl: "https://api.github.com" }
        : {
            appId: "999001",
            appSlug: "devcollab-local-app",
            privateKey: TEST_PEM,
            webhookSecret: options.webhookSecret ?? "whsec_test_secret_1234567890",
            apiBaseUrl: "https://api.github.com",
          },
  });

  const client = new GitHubAppClientService(mockConfigService);
  let ghRevoked = false;
  let headSha = "sha_v1_initial";
  let prState = "open";
  let prMergedAt = null;
  let prReviewsFromGh = [{ id: 88, user: { login: "octoreviewer" }, state: "COMMENTED", submitted_at: "2026-11-27T10:00:00Z" }];
  let prFilesFromGh = [
    {
      sha: "f1",
      filename: "src/app.ts",
      status: "modified",
      additions: 2,
      deletions: 1,
      changes: 3,
      patch: "@@ -1,3 +1,4 @@\n const a = 1;\n-const b = 2;\n+const b = 3;\n+const c = 4;",
      blob_url: "https://github.com/acme/web/blob/sha/src/app.ts",
    },
    {
      sha: "f2",
      filename: "assets/logo.png",
      status: "added",
      additions: 0,
      deletions: 0,
      changes: 0,
      blob_url: "https://github.com/acme/web/blob/sha/assets/logo.png",
    },
    {
      sha: "f3",
      filename: "package-lock.json",
      status: "modified",
      additions: 1800,
      deletions: 200,
      changes: 2000,
      blob_url: "https://github.com/acme/web/blob/sha/package-lock.json",
    },
  ];

  client.setTransportForTesting({
    async request(url) {
      if (ghRevoked && !url.includes("/app/installations/")) {
        return { status: 403, headers: { get: () => null }, json: { message: "Bad credentials / revoked" } };
      }
      if (url.endsWith("/app/installations/77001")) {
        return ghRevoked
          ? { status: 404, headers: { get: () => null }, json: { message: "Not Found" } }
          : {
              status: 200,
              headers: { get: () => null },
              json: { id: 77001, account: { login: "acme-org", type: "Organization", avatar_url: null } },
            };
      }
      if (url.endsWith("/app/installations/77001/access_tokens")) {
        return {
          status: 201,
          headers: { get: () => null },
          json: { token: "ghs_short_lived_mock_token", expires_at: new Date(Date.now() + 3600_000).toISOString() },
        };
      }
      if (url.includes("/installation/repositories")) {
        return {
          status: 200,
          headers: { get: () => null },
          json: {
            total_count: 1,
            repositories: [
              {
                id: 55001,
                name: "devcollab-demo",
                full_name: "acme-org/devcollab-demo",
                private: true,
                html_url: "https://github.com/acme-org/devcollab-demo",
                description: "Private test repo",
                default_branch: "main",
                owner: { login: "acme-org" },
              },
            ],
          },
        };
      }
      if (url.endsWith("/repos/acme-org/devcollab-demo")) {
        return {
          status: 200,
          headers: { get: () => null },
          json: {
            id: 55001,
            name: "devcollab-demo",
            full_name: "acme-org/devcollab-demo",
            private: true,
            html_url: "https://github.com/acme-org/devcollab-demo",
            description: "Private test repo",
            default_branch: "main",
            owner: { login: "acme-org" },
          },
        };
      }
      if (url.includes("/repos/acme-org/devcollab-demo/pulls?")) {
        return {
          status: 200,
          headers: { get: () => null },
          json: [
            {
              id: 10101,
              number: 42,
              title: "Add GitHub diff viewer",
              body: "Implements unified and split diff viewer.",
              state: prState,
              draft: false,
              html_url: "https://github.com/acme-org/devcollab-demo/pull/42",
              user: { login: "dev-author", avatar_url: null },
              head: { ref: "feat/diff-viewer", sha: headSha },
              base: { ref: "main" },
              created_at: "2026-11-26T10:00:00Z",
              updated_at: "2026-11-27T11:00:00Z",
              merged_at: prMergedAt,
              closed_at: null,
            },
          ],
        };
      }
      if (url.endsWith("/repos/acme-org/devcollab-demo/pulls/42")) {
        return {
          status: 200,
          headers: { get: () => null },
          json: {
            id: 10101,
            number: 42,
            title: "Add GitHub diff viewer",
            body: "Implements unified and split diff viewer.",
            state: prState,
            draft: false,
            html_url: "https://github.com/acme-org/devcollab-demo/pull/42",
            user: { login: "dev-author", avatar_url: null },
            head: { ref: "feat/diff-viewer", sha: headSha },
            base: { ref: "main" },
            mergeable_state: "clean",
            additions: 1802,
            deletions: 201,
            changed_files: 3,
            created_at: "2026-11-26T10:00:00Z",
            updated_at: "2026-11-27T11:00:00Z",
            merged_at: prMergedAt,
            closed_at: null,
          },
        };
      }
      if (url.includes("/pulls/42/reviews")) {
        return { status: 200, headers: { get: () => null }, json: prReviewsFromGh };
      }
      if (url.includes("/pulls/42/files")) {
        return { status: 200, headers: { get: () => null }, json: prFilesFromGh };
      }
      return { status: 404, headers: { get: () => null }, json: { message: "Unhandled mock route" } };
    },
  });

  const dbService = { prisma };
  const authz = new AuthorizationService(dbService);
  const orgs = new OrganizationsService(dbService);
  const invitations = new InvitationsService(dbService);
  const projects = new ProjectsService(dbService);
  const tasks = new TasksService(dbService, authz);
  const github = new GitHubService(dbService, authz, mockConfigService, client);

  return {
    state,
    authz,
    orgs,
    invitations,
    projects,
    tasks,
    github,
    client,
    setRevoked: (v) => {
      ghRevoked = v;
    },
    setHeadSha: (sha) => {
      headSha = sha;
    },
    setPrMerged: () => {
      prState = "closed";
      prMergedAt = "2026-11-27T12:00:00Z";
    },
    seedUser(id, name, email) {
      const u = { id, name, email, image: null };
      state.users.set(id, u);
      return u;
    },
    signWebhook(bodyObj, secret = "whsec_test_secret_1234567890") {
      const rawBody = Buffer.from(JSON.stringify(bodyObj), "utf8");
      const sig = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
      return { rawBody, sig };
    },
  };
}

test("Unconfigured GitHub App does not crash services and returns clean status", async () => {
  const env = createGitHubTestEnv({ unconfigured: true });
  env.seedUser("u1", "Owner", "owner@example.com");
  const org = await env.orgs.createOrganization("u1", { name: "Alpha" });
  const proj = await env.projects.createProject("u1", "OWNER", org.id, { name: "Core", key: "COR" });

  const overview = await env.github.getRepositoryOverview(org.id, proj.id, true);
  assert.equal(overview.githubApp.configured, false);
  assert.ok(overview.githubApp.missingFields.includes("GITHUB_APP_ID"));
  assert.equal(overview.repository, null);

  const prs = await env.github.listPullRequests(org.id, proj.id, true, {});
  assert.equal(prs.items.length, 0);
  assert.equal(prs.githubApp.configured, false);
});

test("GitHub App install flow, PM vs Member RBAC, private repo connect, cross-org isolation, sync & files", async () => {
  const env = createGitHubTestEnv();
  env.seedUser("u_owner", "Owner", "owner@example.com");
  env.seedUser("u_pm", "PM User", "pm@example.com");
  env.seedUser("u_member", "Member User", "member@example.com");
  env.seedUser("u_outsider", "Outsider", "outsider@example.com");

  const orgA = await env.orgs.createOrganization("u_owner", { name: "Org A" });
  const orgB = await env.orgs.createOrganization("u_outsider", { name: "Org B" });

  // Add PM and Member to Org A
  for (const [uid, email] of [["u_pm", "pm@example.com"], ["u_member", "member@example.com"]]) {
    const inv = await env.invitations.createInvitation("u_owner", "OWNER", orgA.id, { email, role: "MEMBER" });
    await env.invitations.acceptInvitation(uid, inv.token);
  }
  const projA = await env.projects.createProject("u_owner", "OWNER", orgA.id, { name: "Atlas", key: "ATL" });
  const projB = await env.projects.createProject("u_outsider", "OWNER", orgB.id, { name: "Other", key: "OTH" });
  await env.projects.assignRole("u_owner", "OWNER", null, orgA.id, projA.id, {
    userId: "u_pm",
    role: "PROJECT_MANAGER",
  });

  // Member fails ProjectAccessGuard("manage") for repository management
  const reflector = {
    getAllAndOverride: (key) => (key === "devcollab:projectMode" ? "manage" : undefined),
  };
  const manageGuard = new ProjectAccessGuard(reflector, env.authz);
  await assert.rejects(
    () =>
      manageGuard.canActivate({
        getHandler: () => ({}),
        getClass: () => ({}),
        switchToHttp: () => ({ getRequest: () => ({ userId: "u_member", params: { orgId: orgA.id, projectId: projA.id } }) }),
      }),
    (err) => err.getStatus() === 403,
  );

  // PM starts install flow and gets state URL
  const start = await env.github.startInstallSession("u_pm", orgA.id, projA.id);
  const stateParam = new URL(start.installUrl).searchParams.get("state");
  assert.ok(stateParam);

  // Different user (u_outsider) cannot steal or consume u_pm's state token
  await assert.rejects(
    () => env.github.completeInstallCallback("u_outsider", { state: stateParam, installationId: "77001" }),
    (err) => err.getStatus() === 403,
  );

  // PM completes callback cleanly, single-use replay rejected
  const cb = await env.github.completeInstallCallback("u_pm", {
    state: stateParam,
    installationId: "77001",
    setupAction: "install",
  });
  assert.equal(cb.status, "ready");
  await assert.rejects(
    () => env.github.completeInstallCallback("u_pm", { state: stateParam, installationId: "77001" }),
    (err) => err.getStatus() === 400,
  );

  // Org B cannot connect Org A's installation ID
  await assert.rejects(
    () => env.github.connectRepository("u_outsider", orgB.id, projB.id, { githubInstallationId: "77001", githubRepoId: "55001" }),
    (err) => err.getStatus() === 403,
  );

  // PM connects private repo -> triggers initial PR sync
  const connected = await env.github.connectRepository("u_pm", orgA.id, projA.id, {
    githubInstallationId: "77001",
    githubRepoId: "55001",
  });
  assert.equal(connected.fullName, "acme-org/devcollab-demo");
  assert.equal(connected.isPrivate, true);
  assert.equal(connected.openPrCount, 1);

  // Sync updates existing PR record instead of creating duplicate; rapid sync hits 429 cooldown
  await assert.rejects(
    () => env.github.syncProjectRepository(orgA.id, projA.id, true, false),
    (err) => err.getStatus() === 429,
  );
  const synced = await env.github.syncProjectRepository(orgA.id, projA.id, true, true);
  assert.equal(synced.openPrCount, 1);
  const prList = await env.github.listPullRequests(orgA.id, projA.id, false, { state: "OPEN", search: "#42" });
  assert.equal(prList.total, 1);
  assert.equal(prList.items[0].number, 42);

  // Binary, truncated/large diff files handled without crash
  const filesRes = await env.github.getPullRequestFiles(orgA.id, projA.id, 42);
  assert.equal(filesRes.files.length, 3);
  assert.equal(filesRes.files[0].filename, "src/app.ts");
  assert.equal(filesRes.files[1].isBinary, true);
  assert.equal(filesRes.files[2].isLarge, true);
  assert.equal(filesRes.files[2].isTruncated, true);

  // Outsider cannot read private repo PR details
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_outsider", orgA.id, projA.id, "view"),
    (err) => err.getStatus() === 403,
  );
});

test("Internal review comments, version staleness, separate decisions, task links, webhooks & disconnect", async () => {
  const env = createGitHubTestEnv();
  env.seedUser("u_owner", "Owner", "owner@example.com");
  env.seedUser("u_dev", "Dev", "dev@example.com");
  const org = await env.orgs.createOrganization("u_owner", { name: "Acme" });
  const inv = await env.invitations.createInvitation("u_owner", "OWNER", org.id, { email: "dev@example.com", role: "MEMBER" });
  await env.invitations.acceptInvitation("u_dev", inv.token);
  const proj = await env.projects.createProject("u_owner", "OWNER", org.id, { name: "Platform", key: "PLT" });
  const task = await env.tasks.createTask("u_owner", true, org.id, proj.id, { title: "Ship code review" });

  const start = await env.github.startInstallSession("u_owner", org.id, proj.id);
  const stateParam = new URL(start.installUrl).searchParams.get("state");
  await env.github.completeInstallCallback("u_owner", { state: stateParam, installationId: "77001" });
  await env.github.connectRepository("u_owner", org.id, proj.id, { githubInstallationId: "77001", githubRepoId: "55001" });

  // Dev comments on a specific file + line, records internal approval, and links PR #42 to task
  const comment = await env.github.createReviewComment("u_dev", false, org.id, proj.id, 42, {
    body: "Looks solid on line 3.",
    filePath: "src/app.ts",
    lineNumber: 3,
    lineSide: "RIGHT",
  });
  assert.equal(comment.commitSha, "sha_v1_initial");
  assert.equal(comment.isOutdated, false);

  // Even Owner cannot edit Dev's internal comment (author-only edit)
  await assert.rejects(
    () => env.github.editReviewComment("u_owner", true, org.id, proj.id, 42, comment.id, "Hijack"),
    (err) => err.getStatus() === 403,
  );

  // Dev records DevCollab internal approval (separate from GitHub's COMMENTED state)
  const internalRev = await env.github.upsertInternalReview("u_dev", org.id, proj.id, 42, {
    decision: "INTERNALLY_APPROVED",
    summary: "Tested locally.",
  });
  assert.equal(internalRev.decision, "INTERNALLY_APPROVED");
  assert.equal(internalRev.commitSha, "sha_v1_initial");

  // Link task to PR -> creates PR_LINKED TaskActivity
  const prRow = [...env.state.pullRequests.values()][0];
  await env.github.linkTaskAndPullRequest("u_dev", org.id, proj.id, { taskId: task.id, pullRequestId: prRow.id });
  const taskAfterLink = await env.tasks.getTaskDetail(org.id, proj.id, task.id, "u_dev", false);
  assert.equal(taskAfterLink.linkedPullRequests.length, 1);
  assert.equal(taskAfterLink.activities[0].eventType, "PR_LINKED");

  // Invalid webhook signature rejected with 401
  const badPayload = Buffer.from(JSON.stringify({ action: "synchronize" }), "utf8");
  await assert.rejects(
    () =>
      env.github.processWebhook({
        deliveryId: "deliv-1",
        event: "pull_request",
        signature256: "sha256=" + "0".repeat(64),
        rawBody: badPayload,
      }),
    (err) => err.getStatus() === 401,
  );

  // Valid synchronize webhook updates headSha -> makes prior review/comment outdated!
  env.setHeadSha("sha_v2_updated");
  const syncWh = env.signWebhook({
    action: "synchronize",
    installation: { id: 77001 },
    repository: { id: 55001 },
    pull_request: {
      id: 10101,
      number: 42,
      title: "Add GitHub diff viewer",
      body: "Implements unified and split diff viewer.",
      state: "open",
      draft: false,
      html_url: "https://github.com/acme-org/devcollab-demo/pull/42",
      user: { login: "dev-author" },
      head: { ref: "feat/diff-viewer", sha: "sha_v2_updated" },
      base: { ref: "main" },
      created_at: "2026-11-26T10:00:00Z",
      updated_at: "2026-11-27T11:30:00Z",
      merged_at: null,
      closed_at: null,
    },
  });
  const whRes1 = await env.github.processWebhook({
    deliveryId: "deliv-sync-1",
    event: "pull_request",
    signature256: syncWh.sig,
    rawBody: syncWh.rawBody,
  });
  assert.equal(whRes1.status, "PROCESSED");

  // Duplicate webhook delivery is deduplicated cleanly
  const whResDup = await env.github.processWebhook({
    deliveryId: "deliv-sync-1",
    event: "pull_request",
    signature256: syncWh.sig,
    rawBody: syncWh.rawBody,
  });
  assert.equal(whResDup.duplicate, true);

  // Version awareness: internal approval & comment now flagged isOutdated === true, GitHub decision untouched
  const detailAfterWh = await env.github.getPullRequestDetail(org.id, proj.id, 42, "u_dev", false);
  assert.equal(detailAfterWh.internalReviews[0].isOutdated, true);
  assert.equal(detailAfterWh.comments[0].isOutdated, true);
  assert.equal(detailAfterWh.pullRequest.githubReviewDecision, "COMMENTED");

  // Merging PR via webhook sets PR state=MERGED without auto-closing linked DevCollab task
  env.setPrMerged();
  const mergeWh = env.signWebhook({
    action: "closed",
    installation: { id: 77001 },
    repository: { id: 55001 },
    pull_request: {
      id: 10101,
      number: 42,
      title: "Add GitHub diff viewer",
      body: "Implements unified and split diff viewer.",
      state: "closed",
      draft: false,
      html_url: "https://github.com/acme-org/devcollab-demo/pull/42",
      user: { login: "dev-author" },
      head: { ref: "feat/diff-viewer", sha: "sha_v2_updated" },
      base: { ref: "main" },
      created_at: "2026-11-26T10:00:00Z",
      updated_at: "2026-11-27T12:00:00Z",
      merged_at: "2026-11-27T12:00:00Z",
      closed_at: "2026-11-27T12:00:00Z",
    },
  });
  await env.github.processWebhook({
    deliveryId: "deliv-merge-1",
    event: "pull_request",
    signature256: mergeWh.sig,
    rawBody: mergeWh.rawBody,
  });
  const taskAfterMerge = await env.tasks.getTaskDetail(org.id, proj.id, task.id, "u_dev", false);
  assert.equal(taskAfterMerge.status, "TODO");
  assert.equal(taskAfterMerge.linkedPullRequests[0].state, "MERGED");

  // Revocation webhook marks repo ACCESS_REVOKED cleanly and fails files fetch gracefully
  const revokeWh = env.signWebhook({
    action: "deleted",
    installation: { id: 77001 },
  });
  env.setRevoked(true);
  await env.github.processWebhook({
    deliveryId: "deliv-revoke-1",
    event: "installation",
    signature256: revokeWh.sig,
    rawBody: revokeWh.rawBody,
  });
  const revokedFiles = await env.github.getPullRequestFiles(org.id, proj.id, 42);
  assert.ok(revokedFiles.unavailableReason);

  // Disconnect hides repo data and preserves DevCollab task records
  await env.github.disconnectRepository("u_owner", org.id, proj.id);
  const overviewAfterDisconnect = await env.github.getRepositoryOverview(org.id, proj.id, true);
  assert.equal(overviewAfterDisconnect.repository, null);
  const taskAfterDisconnect = await env.tasks.getTaskDetail(org.id, proj.id, task.id, "u_owner", true);
  assert.equal(taskAfterDisconnect.id, task.id);
  assert.equal(taskAfterDisconnect.linkedPullRequests.length, 0);
});
