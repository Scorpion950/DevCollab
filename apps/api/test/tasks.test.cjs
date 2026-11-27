const { test } = require("node:test");
const assert = require("node:assert/strict");

const { AuthorizationService } = require("../dist/authorization/authorization.service");
const { ProjectAccessGuard } = require("../dist/authorization/project-access.guard");
const { WriteRateLimitGuard } = require("../dist/common/write-rate-limit.guard");
const { OrganizationsService } = require("../dist/organizations/organizations.service");
const { InvitationsService } = require("../dist/invitations/invitations.service");
const { ProjectsService } = require("../dist/projects/projects.service");
const { TasksService } = require("../dist/tasks/tasks.service");

function createTaskTestEnv() {
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

  function hydrateTask(t, include) {
    if (!t) return null;
    const out = { ...t };
    if (include?.assignee) out.assignee = t.assigneeId ? state.users.get(t.assigneeId) ?? null : null;
    if (include?.creator) out.creator = t.creatorId ? state.users.get(t.creatorId) ?? null : null;
    if (include?.project) out.project = state.projects.get(t.projectId);
    if (include?.organization) out.organization = state.organizations.get(t.organizationId);
    if (include?._count) {
      let c = 0;
      for (const cm of state.comments.values()) if (cm.taskId === t.id) c++;
      out._count = { comments: c };
    }
    if (include?.comments) {
      out.comments = [...state.comments.values()]
        .filter((cm) => cm.taskId === t.id)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((cm) => ({ ...cm, author: cm.authorId ? state.users.get(cm.authorId) ?? null : null }));
    }
    if (include?.activities) {
      out.activities = state.activities
        .filter((a) => a.taskId === t.id)
        .slice()
        .reverse()
        .map((a) => ({ ...a, actor: a.actorId ? state.users.get(a.actorId) ?? null : null }));
    }
    return out;
  }

  function matchesWhere(t, where = {}) {
    if (where.id && t.id !== where.id) return false;
    if (where.organizationId && t.organizationId !== where.organizationId) return false;
    if (where.projectId && t.projectId !== where.projectId) return false;
    if (where.archivedAt === null && t.archivedAt !== null) return false;
    if (where.archivedAt?.not === null && t.archivedAt === null) return false;
    if (typeof where.status === "string" && t.status !== where.status) return false;
    if (where.status?.not && t.status === where.status.not) return false;
    if (typeof where.priority === "string" && t.priority !== where.priority) return false;
    if (where.assigneeId === null && t.assigneeId !== null) return false;
    if (typeof where.assigneeId === "string" && t.assigneeId !== where.assigneeId) return false;
    if (where.dueDate?.lt && (!t.dueDate || !(t.dueDate < where.dueDate.lt))) return false;
    if (where.project?.status && state.projects.get(t.projectId)?.status !== where.project.status) return false;
    if (where.organization) {
      if (where.organization.id && t.organizationId !== where.organization.id) return false;
      const reqMem = where.organization.memberships?.some;
      if (reqMem) {
        const mem = membershipByOrgUser(t.organizationId, reqMem.userId);
        if (!mem || mem.status !== reqMem.status) return false;
      }
    }
    if (where.OR) {
      const q = (where.OR[0]?.title?.contains || "").toLowerCase();
      const hay = `${t.title} ${t.identifier} ${t.description || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  const prisma = {
    user: {
      findUnique: async ({ where }) => state.users.get(where.id) ?? null,
    },
    organization: {
      create: async ({ data }) => {
        const now = new Date();
        const org = { id: nextId("org"), ...data, description: data.description ?? null, createdAt: now, updatedAt: now };
        state.organizations.set(org.id, org);
        return org;
      },
    },
    organizationMembership: {
      findUnique: async ({ where, include }) => {
        const key = where.organizationId_userId;
        const m = key ? membershipByOrgUser(key.organizationId, key.userId) : state.memberships.get(where.id) ?? null;
        if (!m) return null;
        const out = { ...m };
        if (include?.organization) {
          out.organization = { ...state.organizations.get(m.organizationId), _count: { memberships: 1, projects: 1 } };
        }
        if (include?.user) out.user = state.users.get(m.userId);
        return out;
      },
      findMany: async ({ where, include }) => {
        const out = [];
        for (const m of state.memberships.values()) {
          if (where.organizationId && m.organizationId !== where.organizationId) continue;
          if (where.status && m.status !== where.status) continue;
          out.push({ ...m, user: include?.user ? state.users.get(m.userId) : undefined });
        }
        return out;
      },
      create: async ({ data, include }) => {
        const now = new Date();
        const m = { id: nextId("mem"), ...data, joinedAt: now, updatedAt: now };
        state.memberships.set(m.id, m);
        const out = { ...m };
        if (include?.organization) {
          out.organization = { ...state.organizations.get(m.organizationId), _count: { memberships: 1, projects: 1 } };
        }
        return out;
      },
    },
    organizationInvitation: {
      findFirst: async () => null,
      findUnique: async ({ where, include }) => {
        for (const inv of state.invitations.values()) {
          if (inv.tokenHash === where.tokenHash) {
            return { ...inv, organization: include?.organization ? state.organizations.get(inv.organizationId) : undefined };
          }
        }
        return null;
      },
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
        return p;
      },
      update: async ({ where, data }) => {
        const p = state.projects.get(where.id);
        if (data.nextTaskNumber?.increment) {
          p.nextTaskNumber += data.nextTaskNumber.increment;
        } else {
          Object.assign(p, data);
        }
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
      findMany: async () => [],
    },
    task: {
      create: async ({ data }) => {
        const now = new Date();
        const t = { id: nextId("tsk"), completedAt: null, archivedAt: null, ...data, createdAt: now, updatedAt: now };
        state.tasks.set(t.id, t);
        return t;
      },
      findFirst: async ({ where, include }) => {
        for (const t of state.tasks.values()) {
          if (!matchesWhere(t, where)) continue;
          return hydrateTask(t, include);
        }
        return null;
      },
      findMany: async ({ where, include, orderBy, skip = 0, take = 100 }) => {
        const items = [...state.tasks.values()].filter((t) => matchesWhere(t, where));
        const prioOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
        if (orderBy?.[0]?.priority) {
          items.sort((a, b) => prioOrder[a.priority] - prioOrder[b.priority] || b.sequenceNumber - a.sequenceNumber);
        } else if (orderBy?.[0]?.createdAt === "asc") {
          items.sort((a, b) => a.createdAt - b.createdAt);
        } else if (orderBy?.[0]?.createdAt === "desc") {
          items.sort((a, b) => b.createdAt - a.createdAt);
        }
        return items.slice(skip, skip + take).map((t) => hydrateTask(t, include));
      },
      count: async ({ where }) => {
        let c = 0;
        for (const t of state.tasks.values()) if (matchesWhere(t, where)) c++;
        return c;
      },
      groupBy: async ({ by, where }) => {
        const counts = new Map();
        for (const t of state.tasks.values()) {
          if (!matchesWhere(t, where)) continue;
          const key = t[by[0]];
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts.entries()].map(([val, c]) => ({ [by[0]]: val, _count: { _all: c } }));
      },
      update: async ({ where, data }) => {
        const t = state.tasks.get(where.id);
        Object.assign(t, data, { updatedAt: new Date(Date.now() + 1) });
        return t;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const t of state.tasks.values()) {
          if (where.organizationId && t.organizationId !== where.organizationId) continue;
          if (where.assigneeId && t.assigneeId !== where.assigneeId) continue;
          Object.assign(t, data);
          count++;
        }
        return { count };
      },
    },
    taskComment: {
      create: async ({ data, include }) => {
        const now = new Date();
        const c = { id: nextId("cmt"), editedAt: null, ...data, createdAt: now, updatedAt: now };
        state.comments.set(c.id, c);
        return { ...c, author: include?.author ? state.users.get(c.authorId) ?? null : null };
      },
      findFirst: async ({ where, include }) => {
        for (const c of state.comments.values()) {
          if (where.id && c.id !== where.id) continue;
          if (where.taskId && c.taskId !== where.taskId) continue;
          const t = state.tasks.get(c.taskId);
          if (where.task && (!t || t.projectId !== where.task.projectId || t.organizationId !== where.task.organizationId)) {
            continue;
          }
          return {
            ...c,
            task: include?.task ? { ...t, project: state.projects.get(t.projectId) } : undefined,
          };
        }
        return null;
      },
      findMany: async ({ where, include }) => {
        return [...state.comments.values()]
          .filter((c) => c.taskId === where.taskId)
          .map((c) => ({ ...c, author: include?.author ? state.users.get(c.authorId) ?? null : null }));
      },
      update: async ({ where, data, include }) => {
        const c = state.comments.get(where.id);
        Object.assign(c, data, { updatedAt: new Date() });
        return { ...c, author: include?.author ? state.users.get(c.authorId) ?? null : null };
      },
      delete: async ({ where }) => {
        const c = state.comments.get(where.id);
        state.comments.delete(where.id);
        return c;
      },
    },
    taskActivity: {
      create: async ({ data }) => {
        const row = { id: nextId("act"), field: null, oldValue: null, newValue: null, ...data, createdAt: new Date() };
        state.activities.push(row);
        return row;
      },
      findMany: async ({ where, include }) => {
        return state.activities
          .filter((a) => (!where.taskId || a.taskId === where.taskId) && (!where.projectId || a.projectId === where.projectId))
          .slice()
          .reverse()
          .map((a) => ({ ...a, actor: include?.actor ? state.users.get(a.actorId) ?? null : null }));
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  const dbService = { prisma };
  const authz = new AuthorizationService(dbService);
  const tasks = new TasksService(dbService, authz);
  const orgs = new OrganizationsService(dbService);
  const invitations = new InvitationsService(dbService);
  const projects = new ProjectsService(dbService, tasks);

  return {
    state,
    authz,
    tasks,
    orgs,
    invitations,
    projects,
    seedUser(id, name, email) {
      const u = { id, name, email, image: null };
      state.users.set(id, u);
      return u;
    },
  };
}

test("Tasks: sequential identifiers, activity timeline, status completion/reopening, and assignee restrictions", async () => {
  const env = createTaskTestEnv();
  env.seedUser("u_owner", "Yash", "yash@example.com");
  env.seedUser("u_dev", "Riya", "riya@example.com");
  env.seedUser("u_outsider", "Sam", "sam@example.com");

  const org = await env.orgs.createOrganization("u_owner", { name: "Yash Tech" });
  const inv = await env.invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "riya@example.com",
    role: "MEMBER",
  });
  await env.invitations.acceptInvitation("u_dev", inv.token);

  const otherOrg = await env.orgs.createOrganization("u_outsider", { name: "Other Org" });
  const project = await env.projects.createProject("u_owner", "OWNER", org.id, {
    name: "Atlas API",
    key: "ATL",
  });

  // Concurrent task creation generates unique sequential identifiers
  const [t1, t2] = await Promise.all([
    env.tasks.createTask("u_owner", true, org.id, project.id, {
      title: "Add trace headers",
      status: "TODO",
      priority: "HIGH",
      assigneeId: "u_dev",
      labels: ["Api", "tracing", "api"],
    }),
    env.tasks.createTask("u_dev", false, org.id, project.id, {
      title: "Fix pagination cursor",
      status: "BACKLOG",
      priority: "URGENT",
    }),
  ]);
  assert.deepEqual([t1.identifier, t2.identifier].sort(), ["ATL-001", "ATL-002"]);
  assert.deepEqual(t1.labels, ["api", "tracing"]);

  const t3 = await env.tasks.createTask("u_owner", true, org.id, project.id, {
    title: "Add readiness check",
    status: "BACKLOG",
    priority: "LOW",
  });
  assert.equal(t3.identifier, "ATL-003");

  // Assigning an outsider outside the organization is rejected
  await assert.rejects(
    () =>
      env.tasks.createTask("u_owner", true, org.id, project.id, {
        title: "Invalid assignee",
        assigneeId: "u_outsider",
      }),
    (err) => err.getStatus() === 400,
  );

  // Move to DONE sets completedAt and records TASK_COMPLETED; moving back clears completedAt and records TASK_REOPENED
  const movedInProgress = await env.tasks.updateTask("u_dev", false, org.id, project.id, t1.id, {
    status: "IN_PROGRESS",
  });
  assert.equal(movedInProgress.status, "IN_PROGRESS");
  assert.equal(movedInProgress.completedAt, null);

  const completed = await env.tasks.updateTask("u_dev", false, org.id, project.id, t1.id, {
    status: "DONE",
  });
  assert.ok(completed.completedAt);
  assert.equal(completed.activities[0].eventType, "TASK_COMPLETED");

  const reopened = await env.tasks.updateTask("u_owner", true, org.id, project.id, t1.id, {
    status: "IN_REVIEW",
    priority: "URGENT",
  });
  assert.equal(reopened.completedAt, null);
  assert.ok(reopened.activities.some((a) => a.eventType === "TASK_REOPENED"));
  assert.ok(reopened.activities.some((a) => a.eventType === "PRIORITY_CHANGED"));

  // Cross-org access denied via ProjectAccessGuard
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_outsider", org.id, project.id, "view"),
    (err) => err.getStatus() === 403,
  );
  await assert.rejects(
    () => env.authz.requireProjectAccess("u_outsider", otherOrg.id, project.id, "view"),
    (err) => err.getStatus() === 404,
  );
});

test("Comments & Archiving: author-only edit, manager moderation delete, and archive permission checks", async () => {
  const env = createTaskTestEnv();
  env.seedUser("u_owner", "Owner", "owner@example.com");
  env.seedUser("u_dev1", "Dev One", "dev1@example.com");
  env.seedUser("u_dev2", "Dev Two", "dev2@example.com");

  const org = await env.orgs.createOrganization("u_owner", { name: "Northline" });
  for (const [uid, email] of [["u_dev1", "dev1@example.com"], ["u_dev2", "dev2@example.com"]]) {
    const inv = await env.invitations.createInvitation("u_owner", "OWNER", org.id, { email, role: "MEMBER" });
    await env.invitations.acceptInvitation(uid, inv.token);
  }
  const project = await env.projects.createProject("u_owner", "OWNER", org.id, {
    name: "Relay",
    key: "RLY",
  });
  const task = await env.tasks.createTask("u_dev1", false, org.id, project.id, {
    title: "Implement webhook signature check",
  });

  // Dev1 posts a comment
  const comment = await env.tasks.addComment("u_dev1", false, org.id, project.id, task.id, "Initial draft ready.");
  assert.equal(comment.canEdit, true);
  assert.equal(comment.canDelete, true);

  // Dev2 cannot edit or delete Dev1's comment; Owner cannot edit Dev1's comment either!
  await assert.rejects(
    () => env.tasks.editComment("u_dev2", false, org.id, project.id, task.id, comment.id, "Tampered"),
    (err) => err.getStatus() === 403,
  );
  await assert.rejects(
    () => env.tasks.deleteComment("u_dev2", false, org.id, project.id, task.id, comment.id),
    (err) => err.getStatus() === 403,
  );
  await assert.rejects(
    () => env.tasks.editComment("u_owner", true, org.id, project.id, task.id, comment.id, "Owner edit"),
    (err) => err.getStatus() === 403,
  );

  // Dev1 edits own comment -> editedAt set
  const edited = await env.tasks.editComment("u_dev1", false, org.id, project.id, task.id, comment.id, "Updated note.");
  assert.ok(edited.editedAt);

  // Owner can moderate (delete) comment
  await env.tasks.deleteComment("u_owner", true, org.id, project.id, task.id, comment.id);
  const remaining = await env.tasks.listComments("u_dev1", false, org.id, project.id, task.id);
  assert.equal(remaining.length, 0);

  // Ordinary developer cannot pass ProjectAccessGuard("manage") to archive tasks
  const reflector = {
    getAllAndOverride: (key) => (key === "devcollab:projectMode" ? "manage" : undefined),
  };
  const projectGuard = new ProjectAccessGuard(reflector, env.authz);
  const devReq = { userId: "u_dev1", params: { orgId: org.id, projectId: project.id } };
  await assert.rejects(
    () => projectGuard.canActivate({ getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({ getRequest: () => devReq }) }),
    (err) => err.getStatus() === 403,
  );

  // Owner archives task -> preserves historical records, blocks further edits until restored
  const archived = await env.tasks.setArchiveState("u_owner", true, org.id, project.id, task.id, true);
  assert.ok(archived.archivedAt);
  await assert.rejects(
    () => env.tasks.updateTask("u_owner", true, org.id, project.id, task.id, { status: "DONE" }),
    (err) => err.getStatus() === 409,
  );
  const restored = await env.tasks.setArchiveState("u_owner", true, org.id, project.id, task.id, false);
  assert.equal(restored.archivedAt, null);
  assert.ok(restored.activities.some((a) => a.eventType === "TASK_ARCHIVED"));
  assert.ok(restored.activities.some((a) => a.eventType === "TASK_RESTORED"));
});

test("Search, filters, My Tasks isolation, and write rate limiting", async () => {
  const env = createTaskTestEnv();
  env.seedUser("u_user", "Builder", "builder@example.com");
  env.seedUser("u_other", "Other", "other@example.com");

  const org1 = await env.orgs.createOrganization("u_user", { name: "Org 1" });
  const org2 = await env.orgs.createOrganization("u_other", { name: "Org 2" });
  const p1 = await env.projects.createProject("u_user", "OWNER", org1.id, { name: "Core", key: "COR" });
  const p2 = await env.projects.createProject("u_other", "OWNER", org2.id, { name: "Secret", key: "SEC" });

  await env.tasks.createTask("u_user", true, org1.id, p1.id, {
    title: "Overdue migration",
    priority: "URGENT",
    assigneeId: "u_user",
    dueDate: "2020-01-01",
  });
  await env.tasks.createTask("u_user", true, org1.id, p1.id, {
    title: "Done documentation",
    status: "DONE",
    priority: "LOW",
    assigneeId: "u_user",
  });
  await env.tasks.createTask("u_other", true, org2.id, p2.id, {
    title: "Private secret task",
    assigneeId: "u_other",
  });

  const filtered = await env.tasks.listProjectTasks(org1.id, p1.id, "u_user", "OWNER", {
    search: "COR-001",
    overdue: "true",
  });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].identifier, "COR-001");

  const mine = await env.tasks.getMyTasks("u_user", { scope: "all", filter: "overdue" });
  assert.equal(mine.counts.overdue, 1);
  assert.equal(mine.counts.completed, 1);
  assert.equal(mine.items.length, 1);
  assert.ok(mine.items.every((t) => t.organizationId === org1.id));

  // Rate limiter rejects after 120 writes in the window
  const limiter = new WriteRateLimitGuard();
  const ctx = { switchToHttp: () => ({ getRequest: () => ({ userId: "u_rate_test" }) }) };
  for (let i = 0; i < 120; i++) {
    assert.equal(limiter.canActivate(ctx), true);
  }
  assert.throws(() => limiter.canActivate(ctx), (err) => err.getStatus() === 429);
});

