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
  assert.ok([200, 303, 307].includes(postRes.status), `Unexpected sign-up status ${postRes.status}`);
  if ([...jar.cookies.keys()].some((k) => k.includes("session-token"))) {
    return;
  }

  const csrfRes = await fetchWithJar(jar, `${web}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const params = new URLSearchParams({ csrfToken, email, password, callbackUrl: "/welcome" });
  const cbRes = await fetchWithJar(jar, `${web}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: web },
    body: params.toString(),
  });
  assert.ok([200, 302, 303].includes(cbRes.status), `Credentials callback failed: ${cbRes.status}`);
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

test("Brick 4 E2E + Brick 3 regressions: tasks, Kanban, detail, comments, activity, RBAC, My Tasks", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br4-${runId}-SecretPass!`;
  const ownerEmail = `brick4-${runId}-owner@example.com`;
  const memberEmail = `brick4-${runId}-member@example.com`;
  const outsiderEmail = `brick4-${runId}-outsider@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];

  try {
    // 1. Anonymous protection (Brick 3 + Brick 4 routes)
    const anonJar = new CookieJar();
    const anonHome = await fetchWithJar(anonJar, `${web}/`);
    assert.equal(anonHome.status, 200);
    for (const protectedPath of ["/app", "/app/tasks", "/app/projects/nonexistent/tasks"]) {
      const res = await fetchWithJar(anonJar, `${web}${protectedPath}`);
      assert.equal(res.status, 307, `Expected 307 redirect for anon ${protectedPath}`);
      assert.match(res.headers.get("location") ?? "", /\/auth\/sign-in/);
    }
    const anonBff = await bffJson(anonJar, "/api/workspace/tasks/mine");
    assert.equal(anonBff.status, 401);

    const anonHowItWorks = await fetchWithJar(anonJar, `${web}/how-it-works`);
    assert.equal(anonHowItWorks.status, 200);
    const anonHowHtml = await anonHowItWorks.text();
    assert.match(anonHowHtml, /href="\/"/);

    // 2. Register and sign in Owner, Member, Outsider
    const ownerJar = new CookieJar();
    const memberJar = new CookieJar();
    const outsiderJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick4 Owner", email: ownerEmail, password });
    await registerAndSignIn(memberJar, { name: "Brick4 Member", email: memberEmail, password });
    await registerAndSignIn(outsiderJar, { name: "Brick4 Outsider", email: outsiderEmail, password });

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

    // 3. Authenticated homepage, sign-in redirect, brand logo, welcome without Skip
    const authRoot = await fetchWithJar(ownerJar, `${web}/`);
    assert.equal(authRoot.status, 307);
    assert.match(authRoot.headers.get("location") ?? "", /\/app$/);

    const authSignIn = await fetchWithJar(ownerJar, `${web}/auth/sign-in`);
    assert.equal(authSignIn.status, 307);
    assert.match(authSignIn.headers.get("location") ?? "", /\/app$/);

    const authWelcome = await fetchWithJar(ownerJar, `${web}/welcome`);
    assert.equal(authWelcome.status, 200);
    const welcomeHtml = await authWelcome.text();
    assert.match(welcomeHtml, /Brick4/);
    assert.doesNotMatch(welcomeHtml, />Skip</i);

    const authHowItWorks = await fetchWithJar(ownerJar, `${web}/how-it-works`);
    assert.equal(authHowItWorks.status, 200);
    const authHowHtml = await authHowItWorks.text();
    assert.match(authHowHtml, /href="\/app"/);

    // 4. Create Org A & Org B via NestJS API, invite Member into Org A
    const orgARes = await apiJson(ownerId, "/organizations", {
      method: "POST",
      body: { name: `Atlas ${runId}`, slug: `atlas-${runId}`, description: "Primary test org" },
    });
    assert.equal(orgARes.status, 201);
    const orgAId = orgARes.json.id;
    createdOrgIds.push(orgAId);

    const orgBRes = await apiJson(ownerId, "/organizations", {
      method: "POST",
      body: { name: `Beacon ${runId}`, slug: `beacon-${runId}`, description: "Secondary org" },
    });
    assert.equal(orgBRes.status, 201);
    const orgBId = orgBRes.json.id;
    createdOrgIds.push(orgBId);

    const inviteRes = await apiJson(ownerId, `/organizations/${orgAId}/invitations`, {
      method: "POST",
      body: { email: memberEmail, role: "MEMBER" },
    });
    assert.equal(inviteRes.status, 201);
    const inviteToken = inviteRes.json.token;
    assert.ok(inviteToken);

    const acceptRes = await apiJson(memberId, "/invitations/accept", {
      method: "POST",
      body: { token: inviteToken },
    });
    assert.equal(acceptRes.status, 201);

    ownerJar.set("devcollab.active.org", orgAId);
    memberJar.set("devcollab.active.org", orgAId);

    // 5. Create Project A in Org A, Project B in Org B
    const projARes = await apiJson(ownerId, `/organizations/${orgAId}/projects`, {
      method: "POST",
      body: { name: "Atlas Core", key: "ATLA", description: "Core task project" },
    });
    assert.equal(projARes.status, 201);
    const projAId = projARes.json.id;

    const projBRes = await apiJson(ownerId, `/organizations/${orgBId}/projects`, {
      method: "POST",
      body: { name: "Beacon Core", key: "BCNB", description: "Other org project" },
    });
    assert.equal(projBRes.status, 201);
    const projBId = projBRes.json.id;

    // Restricted Project Management boundary check
    const memberManageApi = await apiJson(memberId, `/organizations/${orgAId}/projects/${projAId}/management`);
    assert.equal(memberManageApi.status, 403);
    const memberManagePage = await fetchWithJar(memberJar, `${web}/app/projects/${projAId}/manage`);
    assert.equal(memberManagePage.status, 200);
    const memberManageHtml = await memberManagePage.text();
    assert.match(memberManageHtml, /Project management restricted|restricted/i);
    assert.doesNotMatch(memberManageHtml, /Archive project/i);

    // 6. Task Creation through Next.js BFF + Atomic Identifiers
    const tomorrowIso = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const yesterdayIso = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const t1Res = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`, {
      method: "POST",
      body: {
        title: "Design task permissions matrix",
        description: "Ensure strict server-side RBAC enforcement.",
        status: "BACKLOG",
        priority: "URGENT",
        dueDate: tomorrowIso,
        labels: ["security", "api"],
      },
    });
    assert.equal(t1Res.status, 201);
    assert.equal(t1Res.headers.get("cache-control"), "private, no-store");
    const t1 = t1Res.json;
    assert.equal(t1.identifier, "ATLA-001");
    assert.equal(t1.status, "BACKLOG");
    assert.equal(t1.priority, "URGENT");

    // Member creates ATLA-002 assigned to themselves
    const t2Res = await bffJson(memberJar, `/api/workspace/projects/${projAId}/tasks`, {
      method: "POST",
      body: {
        title: "Build responsive Kanban column dropzones",
        description: "Support keyboard and drag-and-drop transitions.",
        status: "TODO",
        priority: "HIGH",
        assigneeId: memberId,
        dueDate: yesterdayIso,
        labels: ["frontend"],
      },
    });
    assert.equal(t2Res.status, 201);
    const t2 = t2Res.json;
    assert.equal(t2.identifier, "ATLA-002");
    assert.equal(t2.assignee?.id, memberId);

    // Concurrent creation yields unique sequential keys ATLA-003, ATLA-004
    const [cA, cB] = await Promise.all([
      bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`, {
        method: "POST",
        body: { title: "Concurrent task alpha", status: "TODO", priority: "LOW" },
      }),
      bffJson(memberJar, `/api/workspace/projects/${projAId}/tasks`, {
        method: "POST",
        body: { title: "Concurrent task beta", status: "TODO", priority: "MEDIUM" },
      }),
    ]);
    assert.equal(cA.status, 201);
    assert.equal(cB.status, 201);
    const identifiers = [cA.json.identifier, cB.json.identifier].sort();
    assert.deepEqual(identifiers, ["ATLA-003", "ATLA-004"]);

    // Assign outsider rejected (must be org member)
    const badAssign = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`, {
      method: "POST",
      body: { title: "Invalid assignee check", assigneeId: outsiderId },
    });
    assert.ok(badAssign.status === 400 || badAssign.status === 403);

    // 7. Kanban moves, completedAt lifecycle, and TaskActivity verification
    const moveDone = await bffJson(memberJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}`, {
      method: "PATCH",
      body: { status: "DONE" },
    });
    assert.equal(moveDone.status, 200);
    assert.equal(moveDone.json.status, "DONE");
    assert.ok(moveDone.json.completedAt, "Moving task to DONE must populate completedAt");

    const moveBack = await bffJson(memberJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}`, {
      method: "PATCH",
      body: {
        status: "IN_REVIEW",
        title: "Design and audit task permissions matrix",
        assigneeId: memberId,
        labels: ["security", "rbac"],
      },
    });
    assert.equal(moveBack.status, 200);
    assert.equal(moveBack.json.status, "IN_REVIEW");
    assert.equal(moveBack.json.completedAt, null, "Moving task out of DONE clears completedAt");
    assert.equal(moveBack.json.assignee?.id, memberId);
    const activityTypes = new Set(moveBack.json.activities.map((a) => a.eventType));
    assert.ok(activityTypes.has("TASK_CREATED"));
    assert.ok(activityTypes.has("TASK_COMPLETED"));
    assert.ok(activityTypes.has("TASK_REOPENED"));
    assert.ok(activityTypes.has("TITLE_UPDATED"));
    assert.ok(activityTypes.has("ASSIGNEE_CHANGED"));
    assert.ok(activityTypes.has("LABELS_UPDATED"));

    // 8. Search, Filters, and Cross-Org Isolation
    const searchRes = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks?search=ATLA-002`);
    assert.equal(searchRes.status, 200);
    assert.equal(searchRes.json.items.length, 1);
    assert.equal(searchRes.json.items[0].id, t2.id);

    const overdueRes = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks?overdue=true`);
    assert.equal(overdueRes.status, 200);
    assert.equal(overdueRes.json.items.length, 1);
    assert.equal(overdueRes.json.items[0].identifier, "ATLA-002");

    // Org switching isolates projects & tasks
    ownerJar.set("devcollab.active.org", orgBId);
    const wrongOrgBoard = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`);
    assert.ok([403, 404].includes(wrongOrgBoard.status));
    ownerJar.set("devcollab.active.org", orgAId);

    // Outsider cannot read or write OrgA tasks
    outsiderJar.set("devcollab.active.org", orgAId);
    const outsiderBff = await bffJson(outsiderJar, `/api/workspace/projects/${projAId}/tasks`);
    assert.ok([403, 404].includes(outsiderBff.status));
    const outsiderApi = await apiJson(outsiderId, `/organizations/${orgAId}/projects/${projAId}/tasks`);
    assert.equal(outsiderApi.status, 403);

    // 9. Comments + Author-Only Edit + Manager Moderation
    const c1Res = await bffJson(memberJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments`, {
      method: "POST",
      body: { body: "Verified RBAC guards locally." },
    });
    assert.equal(c1Res.status, 201);
    const c1 = c1Res.json;

    // Even Org OWNER cannot edit Member's comment
    const ownerEditMemberComment = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments/${c1.id}`,
      { method: "PATCH", body: { body: "Trying to hijack comment" } },
    );
    assert.equal(ownerEditMemberComment.status, 403);

    // Author can edit own comment
    const memberEditOwnComment = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments/${c1.id}`,
      { method: "PATCH", body: { body: "Verified RBAC guards and BFF tests." } },
    );
    assert.equal(memberEditOwnComment.status, 200);
    assert.ok(memberEditOwnComment.json.editedAt);

    // Owner creates comment C2; Member CANNOT delete Owner's comment
    const c2Res = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments`, {
      method: "POST",
      body: { body: "Owner review note." },
    });
    assert.equal(c2Res.status, 201);
    const c2 = c2Res.json;

    const memberDeleteOwnerComment = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments/${c2.id}`,
      { method: "DELETE" },
    );
    assert.equal(memberDeleteOwnerComment.status, 403);

    // Owner CAN moderate (delete) Member's comment C1; verify deletion persists cleanly on fresh GET
    const ownerModerateComment = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/comments/${c1.id}`,
      { method: "DELETE" },
    );
    assert.equal(ownerModerateComment.status, 200);

    const detailReload = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}`);
    assert.equal(detailReload.status, 200);
    assert.equal(detailReload.headers.get("cache-control"), "private, no-store");
    assert.equal(detailReload.json.comments.some((c) => c.id === c1.id), false);
    assert.equal(detailReload.json.comments.some((c) => c.id === c2.id), true);

    // 10. Task Archiving & Restoration Permission Rules
    const memberArchiveAttempt = await bffJson(
      memberJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/archive`,
      { method: "POST" },
    );
    assert.equal(memberArchiveAttempt.status, 403);

    const ownerArchive = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/archive`,
      { method: "POST" },
    );
    assert.equal(ownerArchive.status, 200);
    assert.ok(ownerArchive.json.archivedAt);

    // Archived task excluded from active board, visible in archived filter
    const activeList = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks`);
    assert.equal(activeList.json.items.some((t) => t.id === t1.id), false);
    const archivedList = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks?archived=true`);
    assert.equal(archivedList.json.items.some((t) => t.id === t1.id), true);

    // Editing or commenting on archived task is rejected with 409
    const editArchived = await bffJson(ownerJar, `/api/workspace/projects/${projAId}/tasks/${t1.id}`, {
      method: "PATCH",
      body: { title: "Should fail while archived" },
    });
    assert.equal(editArchived.status, 409);

    const restoreTask = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projAId}/tasks/${t1.id}/restore`,
      { method: "POST" },
    );
    assert.equal(restoreTask.status, 200);
    assert.equal(restoreTask.json.archivedAt, null);
    assert.ok(restoreTask.json.activities.some((a) => a.eventType === "TASK_ARCHIVED"));
    assert.ok(restoreTask.json.activities.some((a) => a.eventType === "TASK_RESTORED"));

    // 11. My Tasks across authorized projects (excludes inaccessible Org B)
    await apiJson(ownerId, `/organizations/${orgBId}/projects/${projBId}/tasks`, {
      method: "POST",
      body: { title: "Secret Beacon task", assigneeId: ownerId },
    });

    const memberMine = await bffJson(memberJar, "/api/workspace/tasks/mine?scope=all&filter=active");
    assert.equal(memberMine.status, 200);
    assert.equal(memberMine.json.items.some((t) => t.identifier === "ATLA-001"), true);
    assert.equal(memberMine.json.items.some((t) => t.identifier === "ATLA-002"), true);
    assert.equal(memberMine.json.items.some((t) => t.identifier.startsWith("BCNB-")), false);

    const memberOverdueMine = await bffJson(memberJar, "/api/workspace/tasks/mine?scope=org&filter=overdue");
    assert.equal(memberOverdueMine.status, 200);
    assert.equal(memberOverdueMine.json.items.some((t) => t.identifier === "ATLA-002"), true);
    assert.equal(memberOverdueMine.json.items.some((t) => t.identifier === "ATLA-001"), false);

    // 12. SSR Pages, Workspace Themes (dark/light), and Warm Latency Measurements
    const tStartBoard = performance.now();
    const boardPage = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}/tasks`);
    const boardMs = Math.round(performance.now() - tStartBoard);
    assert.equal(boardPage.status, 200);
    const boardHtml = await boardPage.text();
    assert.match(boardHtml, /ATLA-001/);
    assert.match(boardHtml, /ATLA-002/);
    assert.match(boardHtml, /data-workspace-theme="dark"/);

    const lightJar = new CookieJar();
    for (const [k, v] of ownerJar.cookies.entries()) lightJar.set(k, v);
    lightJar.set("devcollab.workspace.theme", "light");
    const lightDetailPage = await fetchWithJar(lightJar, `${web}/app/projects/${projAId}/tasks/${t1.id}`);
    assert.equal(lightDetailPage.status, 200);
    const lightDetailHtml = await lightDetailPage.text();
    assert.match(lightDetailHtml, /data-workspace-theme="light"/);
    assert.match(lightDetailHtml, /ATLA-001/);

    const overviewPage = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}`);
    assert.equal(overviewPage.status, 200);
    assert.match(await overviewPage.text(), /ATLA-001/);

    const managePageOwner = await fetchWithJar(ownerJar, `${web}/app/projects/${projAId}/manage`);
    assert.equal(managePageOwner.status, 200);
    const manageOwnerHtml = await managePageOwner.text();
    assert.match(manageOwnerHtml, /Atlas Core/i);
    assert.doesNotMatch(manageOwnerHtml, /Project management restricted/i);

    const tStartMine = performance.now();
    const myTasksPage = await fetchWithJar(memberJar, `${web}/app/tasks`);
    const mineMs = Math.round(performance.now() - tStartMine);
    assert.equal(myTasksPage.status, 200);
    assert.match(await myTasksPage.text(), /ATLA-002/);

    // 13. Logout session revocation check
    const csrfOut = await fetchWithJar(outsiderJar, `${web}/api/auth/csrf`);
    const { csrfToken: outToken } = await csrfOut.json();
    const signOutRes = await fetchWithJar(outsiderJar, `${web}/api/auth/signout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: web },
      body: new URLSearchParams({ csrfToken: outToken }).toString(),
    });
    assert.ok([200, 302, 303].includes(signOutRes.status));
    const afterLogout = await fetchWithJar(outsiderJar, `${web}/app/tasks`);
    assert.equal(afterLogout.status, 307);
    assert.match(afterLogout.headers.get("location") ?? "", /\/auth\/sign-in/);

    console.info(`Warm timings — Project Tasks SSR: ${boardMs}ms, My Tasks SSR: ${mineMs}ms`);
  } finally {
    if (createdOrgIds.length > 0) {
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
    if (createdUserIds.length > 0) {
      await db.session.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.account.deleteMany({ where: { userId: { in: createdUserIds } } });
      await db.authAttempt.deleteMany({
        where: { key: { contains: runId } },
      });
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await db.$disconnect();
  }
});
