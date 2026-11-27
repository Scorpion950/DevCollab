const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { AuthorizationService } = require("../dist/authorization/authorization.service");
const { OrgAccessGuard } = require("../dist/authorization/org-access.guard");
const { ProjectAccessGuard } = require("../dist/authorization/project-access.guard");
const { OrganizationsService } = require("../dist/organizations/organizations.service");
const { MembershipsService } = require("../dist/memberships/memberships.service");
const { InvitationsService } = require("../dist/invitations/invitations.service");
const { ProjectsService } = require("../dist/projects/projects.service");
const { WorkspaceService } = require("../dist/workspace/workspace.service");

function createMockDb() {
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

  function buildOrgInclude(org) {
    let memberships = 0;
    let projects = 0;
    for (const m of state.memberships.values()) if (m.organizationId === org.id) memberships++;
    for (const p of state.projects.values()) if (p.organizationId === org.id) projects++;
    return { ...org, _count: { memberships, projects } };
  }

  function hydrateMembership(m, include) {
    if (!m) return null;
    const out = { ...m };
    if (include?.organization) out.organization = buildOrgInclude(state.organizations.get(m.organizationId));
    if (include?.user) out.user = state.users.get(m.userId);
    return out;
  }

  function hydrateProject(p, include) {
    if (!p) return null;
    const out = { ...p };
    if (include?.createdBy) out.createdBy = p.createdById ? state.users.get(p.createdById) ?? null : null;
    if (include?.roleAssignments) {
      out.roleAssignments = [...state.projectRoles.values()]
        .filter((r) => r.projectId === p.id)
        .map((r) => ({ ...r, user: state.users.get(r.userId) }));
    }
    return out;
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
      create: async ({ data }) => {
        for (const o of state.organizations.values()) {
          if (o.slug === data.slug) throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        const now = new Date();
        const org = { id: nextId("org"), name: data.name, slug: data.slug, description: data.description ?? null, createdAt: now, updatedAt: now };
        state.organizations.set(org.id, org);
        return org;
      },
      update: async ({ where, data }) => {
        const org = state.organizations.get(where.id);
        Object.assign(org, data, { updatedAt: new Date() });
        return org;
      },
    },
    organizationMembership: {
      findUnique: async ({ where, include }) => {
        const key = where.organizationId_userId;
        const m = key ? membershipByOrgUser(key.organizationId, key.userId) : state.memberships.get(where.id) ?? null;
        return hydrateMembership(m, include);
      },
      findUniqueOrThrow: async (args) => {
        const res = await prisma.organizationMembership.findUnique(args);
        if (!res) throw new Error("Not found");
        return res;
      },
      findFirst: async ({ where, include }) => {
        for (const m of state.memberships.values()) {
          if (where.id && m.id !== where.id) continue;
          if (where.organizationId && m.organizationId !== where.organizationId) continue;
          if (where.status && m.status !== where.status) continue;
          return hydrateMembership(m, include);
        }
        return null;
      },
      findMany: async ({ where, include }) => {
        const items = [];
        for (const m of state.memberships.values()) {
          if (where.userId && m.userId !== where.userId) continue;
          if (where.organizationId && m.organizationId !== where.organizationId) continue;
          if (where.status && m.status !== where.status) continue;
          items.push(hydrateMembership(m, include));
        }
        return items;
      },
      count: async ({ where }) => {
        let count = 0;
        for (const m of state.memberships.values()) {
          if (where.organizationId && m.organizationId !== where.organizationId) continue;
          if (where.role && m.role !== where.role) continue;
          if (where.status && m.status !== where.status) continue;
          count++;
        }
        return count;
      },
      create: async ({ data, include }) => {
        if (membershipByOrgUser(data.organizationId, data.userId)) {
          throw Object.assign(new Error("Unique"), { code: "P2002" });
        }
        const now = new Date();
        const m = { id: nextId("mem"), ...data, joinedAt: now, updatedAt: now };
        state.memberships.set(m.id, m);
        return hydrateMembership(m, include);
      },
      update: async ({ where, data, include }) => {
        const m = state.memberships.get(where.id);
        Object.assign(m, data, { updatedAt: new Date() });
        return hydrateMembership(m, include);
      },
      delete: async ({ where }) => {
        const m = state.memberships.get(where.id);
        state.memberships.delete(where.id);
        return m;
      },
    },
    organizationInvitation: {
      findUnique: async ({ where, include }) => {
        for (const inv of state.invitations.values()) {
          if (where.tokenHash && inv.tokenHash !== where.tokenHash) continue;
          if (where.id && inv.id !== where.id) continue;
          const out = { ...inv };
          if (include?.organization) out.organization = state.organizations.get(inv.organizationId);
          if (include?.invitedBy) out.invitedBy = inv.invitedById ? state.users.get(inv.invitedById) ?? null : null;
          return out;
        }
        return null;
      },
      findFirst: async ({ where, include }) => {
        for (const inv of state.invitations.values()) {
          if (where.id && inv.id !== where.id) continue;
          if (where.organizationId && inv.organizationId !== where.organizationId) continue;
          if (where.email && inv.email !== where.email) continue;
          if (where.status && inv.status !== where.status) continue;
          if (where.expiresAt?.gt && !(inv.expiresAt > where.expiresAt.gt)) continue;
          const out = { ...inv };
          if (include?.invitedBy) out.invitedBy = inv.invitedById ? state.users.get(inv.invitedById) ?? null : null;
          return out;
        }
        return null;
      },
      findMany: async ({ where, include }) => {
        const out = [];
        for (const inv of state.invitations.values()) {
          if (where.organizationId && inv.organizationId !== where.organizationId) continue;
          const row = { ...inv };
          if (include?.invitedBy) row.invitedBy = inv.invitedById ? state.users.get(inv.invitedById) ?? null : null;
          out.push(row);
        }
        return out;
      },
      count: async ({ where }) => {
        let c = 0;
        for (const inv of state.invitations.values()) {
          if (where.organizationId && inv.organizationId !== where.organizationId) continue;
          if (where.status && inv.status !== where.status) continue;
          if (where.expiresAt?.gt && !(inv.expiresAt > where.expiresAt.gt)) continue;
          c++;
        }
        return c;
      },
      create: async ({ data, include }) => {
        if (data.activeLock) {
          for (const inv of state.invitations.values()) {
            if (inv.organizationId === data.organizationId && inv.email === data.email && inv.activeLock === data.activeLock) {
              throw Object.assign(new Error("Unique"), { code: "P2002" });
            }
          }
        }
        const now = new Date();
        const inv = { id: nextId("inv"), acceptedAt: null, revokedAt: null, acceptedById: null, ...data, createdAt: now, updatedAt: now };
        state.invitations.set(inv.id, inv);
        const out = { ...inv };
        if (include?.invitedBy) out.invitedBy = inv.invitedById ? state.users.get(inv.invitedById) ?? null : null;
        return out;
      },
      update: async ({ where, data, include }) => {
        const inv = state.invitations.get(where.id);
        Object.assign(inv, data, { updatedAt: new Date() });
        const out = { ...inv };
        if (include?.invitedBy) out.invitedBy = inv.invitedById ? state.users.get(inv.invitedById) ?? null : null;
        return out;
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const inv of state.invitations.values()) {
          if (where.id && inv.id !== where.id) continue;
          if (where.organizationId && inv.organizationId !== where.organizationId) continue;
          if (where.email && inv.email !== where.email) continue;
          if (where.status && inv.status !== where.status) continue;
          if (where.expiresAt?.lte && !(inv.expiresAt <= where.expiresAt.lte)) continue;
          if (where.expiresAt?.gt && !(inv.expiresAt > where.expiresAt.gt)) continue;
          Object.assign(inv, data, { updatedAt: new Date() });
          count++;
        }
        return { count };
      },
    },
    project: {
      findUnique: async ({ where, include }) => {
        let p = null;
        if (where.id) p = state.projects.get(where.id) ?? null;
        else if (where.organizationId_key) {
          for (const item of state.projects.values()) {
            if (item.organizationId === where.organizationId_key.organizationId && item.key === where.organizationId_key.key) p = item;
          }
        } else if (where.organizationId_slug) {
          for (const item of state.projects.values()) {
            if (item.organizationId === where.organizationId_slug.organizationId && item.slug === where.organizationId_slug.slug) p = item;
          }
        }
        return hydrateProject(p, include);
      },
      findUniqueOrThrow: async (args) => {
        const res = await prisma.project.findUnique(args);
        if (!res) throw new Error("Not found");
        return res;
      },
      findFirst: async ({ where, include }) => {
        for (const p of state.projects.values()) {
          if (where.id && p.id !== where.id) continue;
          if (where.organizationId && p.organizationId !== where.organizationId) continue;
          return hydrateProject(p, include);
        }
        return null;
      },
      findMany: async ({ where, include }) => {
        const out = [];
        for (const p of state.projects.values()) {
          if (where.organizationId && p.organizationId !== where.organizationId) continue;
          if (where.status && p.status !== where.status) continue;
          out.push(hydrateProject(p, include));
        }
        return out;
      },
      create: async ({ data }) => {
        for (const p of state.projects.values()) {
          if (p.organizationId === data.organizationId && (p.key === data.key || p.slug === data.slug)) {
            throw Object.assign(new Error("Unique"), { code: "P2002" });
          }
        }
        const now = new Date();
        const p = { id: nextId("prj"), archivedAt: null, ...data, createdAt: now, updatedAt: now };
        state.projects.set(p.id, p);
        return p;
      },
      update: async ({ where, data }) => {
        const p = state.projects.get(where.id);
        if (data.key) {
          for (const other of state.projects.values()) {
            if (other.id !== p.id && other.organizationId === p.organizationId && other.key === data.key) {
              throw Object.assign(new Error("Unique"), { code: "P2002" });
            }
          }
        }
        Object.assign(p, data, { updatedAt: new Date() });
        return p;
      },
    },
    projectRoleAssignment: {
      findUnique: async ({ where, include }) => {
        const k = where.projectId_userId;
        const r = k ? projectRoleByProjectUser(k.projectId, k.userId) : state.projectRoles.get(where.id) ?? null;
        if (!r) return null;
        const out = { ...r };
        if (include?.user) out.user = state.users.get(r.userId);
        return out;
      },
      findMany: async ({ where }) => {
        const out = [];
        for (const r of state.projectRoles.values()) {
          if (where.userId && r.userId !== where.userId) continue;
          if (where.role && r.role !== where.role) continue;
          const p = state.projects.get(r.projectId);
          if (where.project?.organizationId && p?.organizationId !== where.project.organizationId) continue;
          out.push({ ...r, projectId: r.projectId, project: p });
        }
        return out;
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
          Object.assign(existing, update, { updatedAt: new Date() });
          return existing;
        }
        return prisma.projectRoleAssignment.create({ data: create });
      },
      delete: async ({ where }) => {
        const r = state.projectRoles.get(where.id);
        state.projectRoles.delete(where.id);
        return r;
      },
      deleteMany: async ({ where }) => {
        let count = 0;
        for (const [id, r] of state.projectRoles.entries()) {
          if (where.userId && r.userId !== where.userId) continue;
          const p = state.projects.get(r.projectId);
          if (where.project?.organizationId && p?.organizationId !== where.project.organizationId) continue;
          state.projectRoles.delete(id);
          count++;
        }
        return { count };
      },
    },
    organizationAuditLog: {
      create: async ({ data }) => {
        const entry = { id: nextId("aud"), projectId: null, actorId: null, ...data, createdAt: new Date() };
        state.auditLogs.push(entry);
        return entry;
      },
      findMany: async ({ where }) => {
        return state.auditLogs
          .filter((a) => (!where.organizationId || a.organizationId === where.organizationId) && (!where.projectId || a.projectId === where.projectId))
          .slice()
          .reverse()
          .map((a) => ({ ...a, actor: a.actorId ? state.users.get(a.actorId) ?? null : null }));
      },
    },
    $transaction: async (fn) => fn(prisma),
  };

  return {
    state,
    prisma,
    seedUser(id, name, email) {
      const user = { id, name, email, image: null };
      state.users.set(id, user);
      return user;
    },
  };
}

function makeEnv() {
  const db = createMockDb();
  const dbService = { prisma: db.prisma };
  const authz = new AuthorizationService(dbService);
  const orgs = new OrganizationsService(dbService);
  const memberships = new MembershipsService(dbService);
  const invitations = new InvitationsService(dbService);
  const projects = new ProjectsService(dbService);
  const workspace = new WorkspaceService(dbService);
  return { db, authz, orgs, memberships, invitations, projects, workspace };
}

test("Organizations: atomic creation assigns Owner, rejects duplicate/reserved slugs, supports multiple orgs and switching", async () => {
  const { db, authz, orgs, workspace } = makeEnv();
  db.seedUser("u_owner", "Aarav", "aarav@example.com");
  db.seedUser("u_other", "Maya", "maya@example.com");

  const org1 = await orgs.createOrganization("u_owner", {
    name: "Yash Technologies",
    description: "Primary team",
  });
  assert.equal(org1.slug, "yash-technologies");
  assert.equal(org1.role, "OWNER");
  assert.equal(org1.memberCount, 1);

  await assert.rejects(
    () => orgs.createOrganization("u_owner", { name: "Yash Technologies" }),
    (err) => err.getStatus() === 409,
  );
  await assert.rejects(
    () => orgs.createOrganization("u_owner", { name: "Admin", slug: "admin" }),
    (err) => err.getStatus() === 400,
  );

  const org2 = await orgs.createOrganization("u_owner", {
    name: "College Development Team",
    slug: "college-dev",
  });

  const boot1 = await workspace.getBootstrap("u_owner", org2.id);
  assert.equal(boot1.organizations.length, 2);
  assert.equal(boot1.activeOrganization.id, org2.id);

  // Untrusted orgId owned by someone else falls back safely instead of exposing org data.
  const bootOther = await workspace.getBootstrap("u_other", org1.id);
  assert.equal(bootOther.activeOrganization, null);
  await assert.rejects(
    () => authz.requireOrgMembership("u_other", org1.id),
    (err) => err.getStatus() === 403,
  );
});

test("Permissions & Membership: Owner, Admin, Member hierarchies, last-Owner protection, and ownership transfer", async () => {
  const { db, authz, orgs, memberships, invitations } = makeEnv();
  db.seedUser("u_owner", "Owner", "owner@example.com");
  db.seedUser("u_admin", "Admin", "admin@example.com");
  db.seedUser("u_member", "Member", "member@example.com");
  db.seedUser("u_member2", "Member2", "member2@example.com");

  const org = await orgs.createOrganization("u_owner", { name: "Northline" });

  // Owner invites Admin and Member
  const invAdmin = await invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "admin@example.com",
    role: "ADMIN",
  });
  await invitations.acceptInvitation("u_admin", invAdmin.token);

  const invMember = await invitations.createInvitation("u_admin", "ADMIN", org.id, {
    email: "member@example.com",
    role: "MEMBER",
  });
  await invitations.acceptInvitation("u_member", invMember.token);

  // Admin cannot invite ADMIN
  await assert.rejects(
    () => invitations.createInvitation("u_admin", "ADMIN", org.id, { email: "x@example.com", role: "ADMIN" }),
    (err) => err.getStatus() === 403,
  );

  // Member cannot access org dashboard or update settings
  await assert.rejects(
    () => authz.requireOrgMembership("u_member", org.id, ["OWNER", "ADMIN"]),
    (err) => err.getStatus() === 403,
  );

  // Last Owner protection on demotion, removal, and leaving
  const list = await memberships.listMembers(org.id);
  const ownerMem = list.find((m) => m.userId === "u_owner");
  const adminMem = list.find((m) => m.userId === "u_admin");
  const memberMem = list.find((m) => m.userId === "u_member");

  await assert.rejects(
    () => memberships.updateRole("u_owner", "OWNER", org.id, ownerMem.id, "ADMIN"),
    (err) => err.getStatus() === 409,
  );
  await assert.rejects(
    () => orgs.leaveOrganization("u_owner", org.id),
    (err) => err.getStatus() === 409,
  );
  // Admin cannot remove Owner
  await assert.rejects(
    () => memberships.removeMember("u_admin", "ADMIN", org.id, ownerMem.id),
    (err) => err.getStatus() === 403,
  );
  // Admin cannot change roles
  await assert.rejects(
    () => memberships.updateRole("u_admin", "ADMIN", org.id, memberMem.id, "ADMIN"),
    (err) => err.getStatus() === 403,
  );

  // Owner promotes Member to Admin, then transfers ownership to Admin
  await memberships.updateRole("u_owner", "OWNER", org.id, memberMem.id, "ADMIN");
  await memberships.transferOwnership("u_owner", org.id, adminMem.id);

  const afterTransfer = await memberships.listMembers(org.id);
  assert.equal(afterTransfer.find((m) => m.userId === "u_admin").role, "OWNER");
  assert.equal(afterTransfer.find((m) => m.userId === "u_owner").role, "ADMIN");

  // Previous owner can now leave safely
  await orgs.leaveOrganization("u_owner", org.id);
  await assert.rejects(
    () => authz.requireOrgMembership("u_owner", org.id),
    (err) => err.getStatus() === 403,
  );

  // New Owner can invite & remove ordinary member
  const invM2 = await invitations.createInvitation("u_admin", "OWNER", org.id, {
    email: "member2@example.com",
    role: "MEMBER",
  });
  await invitations.acceptInvitation("u_member2", invM2.token);
  const m2 = (await memberships.listMembers(org.id)).find((m) => m.userId === "u_member2");
  await memberships.removeMember("u_member", "ADMIN", org.id, m2.id);
});

test("Invitations: hashed tokens, single-use acceptance, email verification, expiry, revocation, and duplicates", async () => {
  const { db, orgs, invitations } = makeEnv();
  db.seedUser("u_owner", "Owner", "owner@example.com");
  db.seedUser("u_target", "Target", "target@example.com");
  db.seedUser("u_wrong", "Wrong", "wrong@example.com");

  const org = await orgs.createOrganization("u_owner", { name: "Acme" });
  const created = await invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "target@example.com",
    role: "MEMBER",
  });

  // Stored hash must not equal raw token
  const stored = [...db.state.invitations.values()][0];
  assert.notEqual(stored.tokenHash, created.token);
  assert.equal(stored.tokenHash, createHash("sha256").update(created.token).digest("hex"));

  // Duplicate active pending invitation rejected
  await assert.rejects(
    () => invitations.createInvitation("u_owner", "OWNER", org.id, { email: "target@example.com", role: "MEMBER" }),
    (err) => err.getStatus() === 409,
  );

  // Wrong email cannot inspect as eligible or accept
  const mismatch = await invitations.inspectForUser("u_wrong", created.token);
  assert.equal(mismatch.state, "EMAIL_MISMATCH");
  await assert.rejects(
    () => invitations.acceptInvitation("u_wrong", created.token),
    (err) => err.getStatus() === 403,
  );

  // Target email can accept once; second acceptance fails
  const accepted = await invitations.acceptInvitation("u_target", created.token);
  assert.equal(accepted.organizationId, org.id);
  await assert.rejects(
    () => invitations.acceptInvitation("u_target", created.token),
    (err) => err.getStatus() === 409,
  );

  // Existing member cannot be invited again
  await assert.rejects(
    () => invitations.createInvitation("u_owner", "OWNER", org.id, { email: "target@example.com", role: "MEMBER" }),
    (err) => err.getStatus() === 409,
  );

  // Revocation blocks acceptance
  db.seedUser("u_revoked", "Rev", "rev@example.com");
  const inv2 = await invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "rev@example.com",
    role: "MEMBER",
  });
  await invitations.revokeInvitation("u_owner", org.id, inv2.invitation.id);
  assert.equal((await invitations.inspectForUser("u_revoked", inv2.token)).state, "REVOKED");
  await assert.rejects(
    () => invitations.acceptInvitation("u_revoked", inv2.token),
    (err) => err.getStatus() === 409,
  );

  // Expiration blocks acceptance and allows issuing a replacement
  db.seedUser("u_exp", "Exp", "exp@example.com");
  const inv3 = await invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "exp@example.com",
    role: "MEMBER",
  });
  db.state.invitations.get(inv3.invitation.id).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await invitations.inspectForUser("u_exp", inv3.token)).state, "EXPIRED");
  await assert.rejects(
    () => invitations.acceptInvitation("u_exp", inv3.token),
    (err) => err.getStatus() === 409,
  );

  // Fresh replacement succeeds after expiry cleanup
  const inv4 = await invitations.createInvitation("u_owner", "OWNER", org.id, {
    email: "exp@example.com",
    role: "MEMBER",
  });
  assert.equal((await invitations.inspectForUser("u_exp", inv4.token)).state, "ELIGIBLE");
});

test("Projects & Project Roles: PM authorization, reassignment, developer restriction, archive/restore, and cross-org IDOR protection", async () => {
  const { db, authz, orgs, invitations, projects } = makeEnv();
  db.seedUser("u_owner", "Owner", "owner@example.com");
  db.seedUser("u_alice", "Alice", "alice@example.com");
  db.seedUser("u_bob", "Bob", "bob@example.com");
  db.seedUser("u_outsider", "Outsider", "outsider@example.com");

  const orgA = await orgs.createOrganization("u_owner", { name: "Org A" });
  const orgB = await orgs.createOrganization("u_outsider", { name: "Org B" });

  for (const [id, email] of [["u_alice", "alice@example.com"], ["u_bob", "bob@example.com"]]) {
    const inv = await invitations.createInvitation("u_owner", "OWNER", orgA.id, { email, role: "MEMBER" });
    await invitations.acceptInvitation(id, inv.token);
  }

  // Owner creates project and initially assigns Alice as Project Manager
  const prj = await projects.createProject("u_owner", "OWNER", orgA.id, {
    name: "Atlas API",
    key: "ATL",
    description: "Core backend",
    projectManagerId: "u_alice",
  });
  assert.equal(prj.key, "ATL");
  assert.equal(prj.projectManagers[0].userId, "u_alice");

  // All org members can view developer project view
  await authz.requireProjectAccess("u_bob", orgA.id, prj.id, "view");

  // Bob (ordinary Member) is blocked from project management dashboard
  await assert.rejects(
    () => authz.requireProjectAccess("u_bob", orgA.id, prj.id, "manage"),
    (err) => err.getStatus() === 403,
  );

  // Alice (assigned Project Manager) CAN access management dashboard and assign Bob as Developer
  await authz.requireProjectAccess("u_alice", orgA.id, prj.id, "manage");
  await projects.assignRole("u_alice", "MEMBER", "PROJECT_MANAGER", orgA.id, prj.id, {
    userId: "u_bob",
    role: "DEVELOPER",
  });

  // Alice (PM, not Org Admin) CANNOT promote herself or another user to PM, and OrgAccessGuard blocks archive
  await assert.rejects(
    () => projects.assignRole("u_alice", "MEMBER", "PROJECT_MANAGER", orgA.id, prj.id, { userId: "u_bob", role: "PROJECT_MANAGER" }),
    (err) => err.getStatus() === 403,
  );

  // Owner reassigns Alice from PROJECT_MANAGER -> DEVELOPER and promotes Bob -> PROJECT_MANAGER
  await projects.assignRole("u_owner", "OWNER", null, orgA.id, prj.id, { userId: "u_alice", role: "DEVELOPER" });
  await projects.assignRole("u_owner", "OWNER", null, orgA.id, prj.id, { userId: "u_bob", role: "PROJECT_MANAGER" });

  // Alice immediately loses management access; Bob gains it
  await assert.rejects(
    () => authz.requireProjectAccess("u_alice", orgA.id, prj.id, "manage"),
    (err) => err.getStatus() === 403,
  );
  await authz.requireProjectAccess("u_bob", orgA.id, prj.id, "manage");

  // Cross-org IDOR: Org B owner cannot read Org A's project via Org B or Org A
  await assert.rejects(
    () => authz.requireProjectAccess("u_outsider", orgB.id, prj.id, "view"),
    (err) => err.getStatus() === 404,
  );
  await assert.rejects(
    () => authz.requireProjectAccess("u_outsider", orgA.id, prj.id, "view"),
    (err) => err.getStatus() === 403,
  );

  // Archive and restore
  const archived = await projects.setArchiveState("u_owner", "OWNER", orgA.id, prj.id, true);
  assert.equal(archived.status, "ARCHIVED");
  await assert.rejects(
    () => projects.setArchiveState("u_owner", "OWNER", orgA.id, prj.id, true),
    (err) => err.getStatus() === 409,
  );
  const restored = await projects.setArchiveState("u_owner", "OWNER", orgA.id, prj.id, false);
  assert.equal(restored.status, "ACTIVE");
});

test("Guards: OrgAccessGuard and ProjectAccessGuard enforce Reflector metadata and reject missing auth", async () => {
  const { db, authz } = makeEnv();
  db.seedUser("u1", "User 1", "u1@example.com");
  const reflector = {
    getAllAndOverride: (key) => {
      if (key === "devcollab:orgRoles") return ["OWNER"];
      if (key === "devcollab:projectMode") return "manage";
      return undefined;
    },
  };
  const orgGuard = new OrgAccessGuard(reflector, authz);
  const projectGuard = new ProjectAccessGuard(reflector, authz);

  const req = { headers: {}, userId: "u1", params: { orgId: "org_missing", projectId: "prj_missing" } };
  const ctx = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  };

  await assert.rejects(() => orgGuard.canActivate(ctx), (err) => err.getStatus() === 403);
  await assert.rejects(() => projectGuard.canActivate(ctx), (err) => err.getStatus() === 403);
});
