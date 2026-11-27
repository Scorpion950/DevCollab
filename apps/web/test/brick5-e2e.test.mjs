import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

const {
  AbortSignal,
  FormData,
  Headers,
  TextEncoder,
  URLSearchParams,
  console,
  fetch,
  performance,
} = globalThis;

const require = createRequire(import.meta.url);
const { SignJWT } = require("jose");
const { getDatabase } = require("@devcollab/database");

function loadEnvDefaults() {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../apps/api/.env"),
    path.resolve(process.cwd(), "../api/.env"),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), "../../apps/web/.env.local"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key]) continue;
      let val = trimmed.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadEnvDefaults();

const web = (process.env.E2E_WEB_URL || "http://localhost:3000").replace(/\/$/, "");
const api = (process.env.E2E_API_URL || "http://localhost:4000/api").replace(/\/$/, "");

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  capture(response) {
    const setCookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      const name = pair.slice(0, eq).trim();
      const val = pair.slice(eq + 1).trim();
      if (!val) this.cookies.delete(name);
      else this.cookies.set(name, val);
    }
  }
  set(name, value) {
    if (!value) this.cookies.delete(name);
    else this.cookies.set(name, value);
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function fetchWithJar(jar, url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookieHeader = jar.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  const res = await fetch(url, {
    ...init,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  jar.capture(res);
  return res;
}

async function extractActionForm(html, matchField) {
  for (const [form] of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
    if (!form.includes(matchField)) continue;
    const body = new FormData();
    for (const [input] of form.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
      const name = input.match(/name="([^"]+)"/)?.[1];
      const value = input.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name) body.append(name, value.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    }
    return body;
  }
  throw new Error(`Could not locate form containing ${matchField}`);
}

async function registerAndSignIn(jar, { name, email, password }) {
  const pageRes = await fetchWithJar(jar, `${web}/auth/sign-up`);
  assert.equal(pageRes.status, 200);
  const html = await pageRes.text();
  const body = await extractActionForm(html, 'name="confirm"');
  body.set("name", name);
  body.set("email", email);
  body.set("password", password);
  body.set("confirm", password);

  const postRes = await fetchWithJar(jar, `${web}/auth/sign-up`, {
    method: "POST",
    headers: { Origin: web },
    body,
  });
  assert.ok([200, 303, 307].includes(postRes.status));
  if ([...jar.cookies.keys()].some((k) => k.includes("session-token"))) return;

  const csrfRes = await fetchWithJar(jar, `${web}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const params = new URLSearchParams({ csrfToken, email, password, callbackUrl: "/welcome" });
  const cbRes = await fetchWithJar(jar, `${web}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: web },
    body: params.toString(),
  });
  assert.ok([200, 302, 303].includes(cbRes.status));
}

async function signAssertion(userId) {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  assert.ok(secret && secret.length >= 32, "INTERNAL_AUTH_SECRET must be set (>= 32 chars)");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web")
    .setAudience("devcollab-api")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(secret));
}

async function apiJson(userId, apiPath, init = {}) {
  const token = await signAssertion(userId);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(`${api}${apiPath.startsWith("/") ? apiPath : `/${apiPath}`}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, json };
}

async function bffJson(jar, bffPath, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Origin", web);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetchWithJar(jar, `${web}${bffPath}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, ok: res.ok, headers: res.headers, json };
}

test("Brick 5 E2E: unconfigured GitHub safety, repository RBAC, PR workspace, internal reviews, task linking & disconnect", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br5-${runId}-SecretPass!`;
  const ownerEmail = `brick5-${runId}-owner@example.com`;
  const memberEmail = `brick5-${runId}-member@example.com`;
  const outsiderEmail = `brick5-${runId}-outsider@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];
  const createdInstallationIds = [];

  try {
    // 1. Anonymous protection on new Brick 5 routes + webhook signature rejection
    const anonJar = new CookieJar();
    for (const p of ["/app/projects/fake/repository", "/app/projects/fake/pull-requests", "/app/projects/fake/pull-requests/1"]) {
      const res = await fetchWithJar(anonJar, `${web}${p}`);
      assert.equal(res.status, 307);
      assert.match(res.headers.get("location") ?? "", /\/auth\/sign-in/);
    }
    const anonBff = await bffJson(anonJar, "/api/workspace/projects/fake/github/repository");
    assert.equal(anonBff.status, 401);

    const whReject = await fetch(`${web}/api/webhooks/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "ping",
        "x-github-delivery": `deliv-${runId}`,
        "x-hub-signature-256": `sha256=${"0".repeat(64)}`,
      },
      body: JSON.stringify({ zen: "test" }),
    });
    assert.ok([401, 503].includes(whReject.status), `Webhook rejected invalid/unconfigured request: ${whReject.status}`);

    // 2. Register & sign in Owner, Member, Outsider
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const outsiderJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick5 Owner", email: ownerEmail, password });
    await registerAndSignIn(memberJar, { name: "Brick5 Member", email: memberEmail, password });
    await registerAndSignIn(outsiderJar, { name: "Brick5 Outsider", email: outsiderEmail, password });

    const [ownerRow, memberRow, outsiderRow] = await Promise.all([
      db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: memberEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: outsiderEmail }, select: { id: true } }),
    ]);
    assert.ok(ownerRow && memberRow && outsiderRow);
    const ownerId = ownerRow.id;
    const memberId = memberRow.id;
    const outsiderId = outsiderRow.id;
    createdUserIds.push(ownerId, memberId, outsiderId);

    // 3. Create OrgA (ProjA) & OrgB (ProjB); invite Member into OrgA
    const orgARes = await apiJson(ownerId, "/organizations", {
      method: "POST",
      body: { name: `Brick5 OrgA ${runId}`, slug: `br5a-${runId}` },
    });
    assert.equal(orgARes.status, 201);
    const orgAId = orgARes.json.id;
    createdOrgIds.push(orgAId);

    const orgBRes = await apiJson(ownerId, "/organizations", {
      method: "POST",
      body: { name: `Brick5 OrgB ${runId}`, slug: `br5b-${runId}` },
    });
    assert.equal(orgBRes.status, 201);
    const orgBId = orgBRes.json.id;
    createdOrgIds.push(orgBId);

    const inv = await apiJson(ownerId, `/organizations/${orgAId}/invitations`, {
      method: "POST",
      body: { email: memberEmail, role: "MEMBER" },
    });
    assert.equal(inv.status, 201);
    await apiJson(memberId, "/invitations/accept", {
      method: "POST",
      body: { token: inv.json.token },
    });

    const projARes = await apiJson(ownerId, `/organizations/${orgAId}/projects`, {
      method: "POST",
      body: { name: "Nebula Core", key: "NEB" },
    });
    assert.equal(projARes.status, 201);
    const projAId = projARes.json.id;

    const projBRes = await apiJson(ownerId, `/organizations/${orgBId}/projects`, {
      method: "POST",
      body: { name: "Beacon Core", key: "BCN" },
    });
    assert.equal(projBRes.status, 201);
    const projBId = projBRes.json.id;

    ownerJar.set("devcollab.active.org", orgAId);
    memberJar.set("devcollab.active.org", orgAId);

    // 4. Verify missing GitHub App credentials never crash Repository/PR or existing routes
    const unconfiguredRepoPage = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}/repository`);
    assert.equal(unconfiguredRepoPage.status, 200);
    const unconfiguredPrsPage = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}/pull-requests`);
    assert.equal(unconfiguredPrsPage.status, 200);
    const tasksBoardPage = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}/tasks`);
    assert.equal(tasksBoardPage.status, 200);

    // Callback without state cleanly redirects back to projects
    const badCb = await fetchWithJar(ownerJar, `${web}/api/workspace/integrations/github/callback`);
    assert.equal(badCb.status, 307);
    assert.match(badCb.headers.get("location") ?? "", /githubError=missing_state/);

    // 5. Create Brick 4 Task + seed test GitHub installation, private repo, and PR #77 in Neon
    const taskRes = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`, {
      method: "POST",
      body: { title: "Verify Brick 5 PR integration", status: "TODO", priority: "HIGH" },
    });
    assert.equal(taskRes.status, 201);
    const task1 = taskRes.json;

    const instRow = await db.gitHubAppInstallation.create({
      data: {
        githubInstallationId: String(900_000_000 + Math.floor(Math.random() * 9_000_000)),
        accountLogin: `acme-${runId}`,
        accountType: "Organization",
        status: "ACTIVE",
      },
    });
    createdInstallationIds.push(instRow.id);
    await db.organizationGitHubInstallation.create({
      data: {
        organizationId: orgAId,
        installationId: instRow.id,
        connectedById: ownerId,
      },
    });
    const repoRow = await db.projectRepository.create({
      data: {
        organizationId: orgAId,
        projectId: projAId,
        installationId: instRow.id,
        githubRepoId: String(800_000_000 + Math.floor(Math.random() * 9_000_000)),
        owner: `acme-${runId}`,
        name: `private-nebula-${runId}`,
        fullName: `acme-${runId}/private-nebula-${runId}`,
        defaultBranch: "main",
        description: "Private test repo",
        htmlUrl: `https://github.com/acme-${runId}/private-nebula-${runId}`,
        isPrivate: true,
        status: "CONNECTED",
        activeLock: "ACTIVE",
        connectedById: ownerId,
        openPrCount: 1,
        lastSyncedAt: new Date(),
        lastSyncStatus: "SUCCEEDED",
      },
    });
    const prRow = await db.pullRequest.create({
      data: {
        organizationId: orgAId,
        projectId: projAId,
        projectRepositoryId: repoRow.id,
        githubPrId: `ghpr-${runId}`,
        number: 77,
        title: "Implement secure PR diff viewer",
        body: "Adds unified and side-by-side diff viewer.",
        state: "OPEN",
        isDraft: false,
        authorLogin: "dev-collaborator",
        headRef: "feat/diff-viewer",
        baseRef: "main",
        headSha: "1111111aaaaaaa2222222bbbbbbb3333333ccccc",
        additions: 120,
        deletions: 14,
        changedFilesCount: 3,
        htmlUrl: `https://github.com/acme-${runId}/private-nebula-${runId}/pull/77`,
        githubCreatedAt: new Date(Date.now() - 3600_000),
        githubUpdatedAt: new Date(),
      },
    });

    // 6. RBAC & Cross-org isolation on connected private repo
    const memberDisconnectAttempt = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/disconnect`,
      { method: "POST" },
    );
    assert.equal(memberDisconnectAttempt.status, 403);

    const memberConnectAttempt = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/connect`,
      { method: "POST", body: { githubInstallationId: instRow.githubInstallationId, githubRepoId: repoRow.githubRepoId } },
    );
    assert.equal(memberConnectAttempt.status, 403);

    outsiderJar.set("devcollab.active.org", orgAId);
    const outsiderRepoBff = await bffJson(outsiderJar, `/api/workspace/projects/${projAId}/github/repository`);
    assert.ok([403, 404].includes(outsiderRepoBff.status));
    const outsiderPrApi = await apiJson(outsiderId, `/organizations/${orgAId}/projects/${projAId}/github/pull-requests/77`);
    assert.equal(outsiderPrApi.status, 403);

    // Org B active cookie cannot access ProjA PRs
    ownerJar.set("devcollab.active.org", orgBId);
    const wrongOrgPr = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/github/pull-requests/77`);
    assert.ok([403, 404].includes(wrongOrgPr.status));
    ownerJar.set("devcollab.active.org", orgAId);

    // 7. Repository & PR pages + search + comments + internal decisions + task links
    const overviewStart = performance.now();
    const repoSsr = await fetchWithJar(memberJar, `${web}/app/projects/${projAId}/repository`);
    const repoSsrMs = Math.round(performance.now() - overviewStart);
    assert.equal(repoSsr.status, 200);
    assert.match(await repoSsr.text(), new RegExp(`acme-${runId}/private-nebula-${runId}`));

    const prListBff = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/pull-requests?state=OPEN&search=%2377`,
    );
    assert.equal(prListBff.status, 200);
    assert.equal(prListBff.headers.get("cache-control"), "private, no-store");
    assert.equal(prListBff.json.items.length, 1);
    assert.equal(prListBff.json.items[0].number, 77);

    const prDetailStart = performance.now();
    const prDetailSsr = await fetchWithJar(memberJar, `${web}/app/projects/${projAId}/pull-requests/77`);
    const prDetailMs = Math.round(performance.now() - prDetailStart);
    assert.equal(prDetailSsr.status, 200);
    const prDetailHtml = await prDetailSsr.text();
    assert.match(prDetailHtml, /Implement secure PR diff viewer/);
    assert.match(prDetailHtml, /DevCollab Internal Reviews/);

    // Member posts file/line review comment + records internal approval
    const cRes = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/pull-requests/77/comments`,
      {
        method: "POST",
        body: {
          body: "Check null handling on empty patches.",
          filePath: "src/diff.ts",
          lineNumber: 12,
          lineSide: "RIGHT",
        },
      },
    );
    assert.equal(cRes.status, 201);
    const c1 = cRes.json;
    assert.equal(c1.authorId, memberId);
    assert.equal(c1.filePath, "src/diff.ts");
    assert.equal(c1.lineNumber, 12);

    // Owner cannot edit Member's review comment (author-only edit)
    const ownerHijackEdit = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/github/pull-requests/77/comments/${c1.id}`,
      { method: "PATCH", body: { body: "Edited by admin" } },
    );
    assert.equal(ownerHijackEdit.status, 403);

    const memberEditOwn = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/pull-requests/77/comments/${c1.id}`,
      { method: "PATCH", body: { body: "Check null handling on empty or binary patches." } },
    );
    assert.equal(memberEditOwn.status, 200);
    assert.ok(memberEditOwn.json.editedAt);

    const revRes = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/github/pull-requests/77/internal-review`,
      { method: "PUT", body: { decision: "INTERNALLY_APPROVED", summary: "Reviewed diff safely." } },
    );
    assert.equal(revRes.status, 200);
    assert.equal(revRes.json.decision, "INTERNALLY_APPROVED");

    // Link PR #77 to Task1 via task BFF route & assert GitHub review stays separate and Task stays TODO
    const linkRes = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/tasks/${task1.id}/pull-requests`,
      { method: "POST", body: { pullRequestId: prRow.id } },
    );
    assert.equal(linkRes.status, 200);

    const taskAfterLink = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks/${task1.id}`);
    assert.equal(taskAfterLink.status, 200);
    assert.equal(taskAfterLink.json.status, "TODO");
    assert.equal(taskAfterLink.json.linkedPullRequests.length, 1);
    assert.equal(taskAfterLink.json.linkedPullRequests[0].number, 77);
    assert.equal(taskAfterLink.json.activities[0].eventType, "PR_LINKED");

    // Cross-org task link attempt fails
    const orgBTaskRes = await apiJson(ownerId, `/organizations/${orgBId}/projects/${projBId}/tasks`, {
      method: "POST",
      body: { title: "Org B task" },
    });
    assert.equal(orgBTaskRes.status, 201);
    ownerJar.set("devcollab.active.org", orgBId);
    const crossLink = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projBId}/tasks/${orgBTaskRes.json.id}/pull-requests`,
      { method: "POST", body: { pullRequestId: prRow.id } },
    );
    assert.equal(crossLink.status, 404);
    ownerJar.set("devcollab.active.org", orgAId);

    // 8. Disconnect hides repository data while preserving Task1 & TaskActivity
    const discRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/github/disconnect`,
      { method: "POST" },
    );
    assert.equal(discRes.status, 200);

    const afterDisconnectRepo = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/github/repository`,
    );
    assert.equal(afterDisconnectRepo.status, 200);
    assert.equal(afterDisconnectRepo.json.repository, null);

    const afterDisconnectTask = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/tasks/${task1.id}`,
    );
    assert.equal(afterDisconnectTask.status, 200);
    assert.equal(afterDisconnectTask.json.id, task1.id);
    assert.equal(afterDisconnectTask.json.linkedPullRequests.length, 0);

    console.info(`Warm Brick 5 timings — Repository SSR: ${repoSsrMs}ms, PR Detail SSR: ${prDetailMs}ms`);
  } finally {
    if (createdOrgIds.length > 0) {
      await db.taskPullRequestLink.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.pullRequestInternalReview.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.pullRequestReviewComment.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.pullRequest.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.projectRepository.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.gitHubInstallSession.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.organizationGitHubInstallation.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.taskActivity.deleteMany({ where: { project: { organizationId: { in: createdOrgIds } } } });
      await db.taskComment.deleteMany({ where: { task: { organizationId: { in: createdOrgIds } } } });
      await db.task.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.projectRoleAssignment.deleteMany({ where: { project: { organizationId: { in: createdOrgIds } } } });
      await db.project.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.organizationInvitation.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.organizationAuditLog.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.organizationMembership.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
      await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    }
    if (createdInstallationIds.length > 0) {
      await db.gitHubAppInstallation.deleteMany({ where: { id: { in: createdInstallationIds } } });
    }
    if (createdUserIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.account.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.authAttempt.deleteMany({ where: { key: { contains: runId } } });
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await db.$disconnect();
  }
});
