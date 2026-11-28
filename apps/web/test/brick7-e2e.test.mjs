import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
  fetch,
} = globalThis;

const require = createRequire(import.meta.url);
const { SignJWT } = require("jose");
const { createSafeTarGzFromEntries } = require("../../../packages/ai-core/dist/index.js");
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
const worker = (process.env.E2E_WORKER_URL || "http://127.0.0.1:4100").replace(/\/$/, "");

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

async function signJwt(aud, sub) {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  assert.ok(secret && secret.length >= 32, "INTERNAL_AUTH_SECRET must be set (>= 32 chars)");
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(aud === "devcollab-worker" ? "devcollab-api" : "devcollab-web")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("30s");
  if (sub) builder.setSubject(sub);
  return builder.sign(new TextEncoder().encode(secret));
}

async function apiJson(userId, apiPath, init = {}) {
  const token = await signJwt("devcollab-api", userId);
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

test("Brick 7 E2E: Browser IDE RBAC, live worker file explorer, optimistic save conflicts, local Git commits, AI patch apply, snapshots & terminal safety", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br7-${runId}-SecretPass!`;
  const ownerEmail = `brick7-${runId}-owner@example.com`;
  const devEmail = `brick7-${runId}-dev@example.com`;
  const memberEmail = `brick7-${runId}-mem@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];
  const createdInstallationIds = [];
  const initializedPathKeys = [];

  try {
    // 1. Anonymous protection & zero Monaco/xterm on landing page
    const anonJar = new CookieJar();
    const ideAnon = await fetchWithJar(anonJar, `${web}/app/projects/fake/ide`);
    assert.equal(ideAnon.status, 307);
    assert.match(ideAnon.headers.get("location") ?? "", /\/auth\/sign-in/);

    const homeHtml = await (await fetch(`${web}/`)).text();
    assert.equal(homeHtml.includes("monaco"), false);
    assert.equal(homeHtml.includes("xterm"), false);

    // 2. Register Owner, Developer, Member
    const ownerJar = new CookieJar();
    const devJar = new CookieJar();
    const memJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick7 Owner", email: ownerEmail, password });
    await registerAndSignIn(devJar, { name: "Brick7 Dev", email: devEmail, password });
    await registerAndSignIn(memJar, { name: "Brick7 Member", email: memberEmail, password });

    const [ownerRow, devRow, memRow] = await Promise.all([
      db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: devEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: memberEmail }, select: { id: true } }),
    ]);
    createdUserIds.push(ownerRow.id, devRow.id, memRow.id);

    // 3. Create Org & Project; invite Dev + Member; assign Dev as DEVELOPER with AI permission
    const orgRes = await apiJson(ownerRow.id, "/organizations", {
      method: "POST",
      body: { name: `Brick7 Org ${runId}`, slug: `br7-${runId}` },
    });
    assert.equal(orgRes.status, 201);
    const orgId = orgRes.json.id;
    createdOrgIds.push(orgId);

    for (const [email, userId] of [
      [devEmail, devRow.id],
      [memberEmail, memRow.id],
    ]) {
      const inv = await apiJson(ownerRow.id, `/organizations/${orgId}/invitations`, {
        method: "POST",
        body: { email, role: "MEMBER" },
      });
      await apiJson(userId, "/invitations/accept", {
        method: "POST",
        body: { token: inv.json.token },
      });
    }

    const projRes = await apiJson(ownerRow.id, `/organizations/${orgId}/projects`, {
      method: "POST",
      body: { name: "Vanguard IDE", key: "VGD" },
    });
    assert.equal(projRes.status, 201);
    const projId = projRes.json.id;

    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${projId}/roles`, {
      method: "PUT",
      body: { userId: devRow.id, role: "DEVELOPER", canRunAi: true },
    });

    ownerJar.set("devcollab.active.org", orgId);
    devJar.set("devcollab.active.org", orgId);
    memJar.set("devcollab.active.org", orgId);

    // Unassigned member cannot open IDE overview (403)
    const memOverview = await bffJson(memJar, `/api/workspace/projects/${projId}/ide/overview`);
    assert.equal(memOverview.status, 403);

    // Developer can open IDE SSR page
    const devIdePage = await fetchWithJar(devJar, `${web}/app/projects/${projId}/ide`);
    assert.equal(devIdePage.status, 200);

    // 4. Seed connected repo, Task, AI Proposal & real isolated workspace via live Worker
    const instRow = await db.gitHubAppInstallation.create({
      data: {
        githubInstallationId: String(900_000_000 + Math.floor(Math.random() * 9_000_000)),
        accountLogin: `vanguard-${runId}`,
        accountType: "Organization",
        status: "ACTIVE",
      },
    });
    createdInstallationIds.push(instRow.id);
    await db.organizationGitHubInstallation.create({
      data: { organizationId: orgId, installationId: instRow.id, connectedById: ownerRow.id },
    });
    const repoRow = await db.projectRepository.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        installationId: instRow.id,
        githubRepoId: String(800_000_000 + Math.floor(Math.random() * 9_000_000)),
        owner: `vanguard-${runId}`,
        name: `service-${runId}`,
        fullName: `vanguard-${runId}/service-${runId}`,
        defaultBranch: "main",
        htmlUrl: `https://github.com/vanguard-${runId}/service-${runId}`,
        isPrivate: true,
        status: "CONNECTED",
        activeLock: "ACTIVE",
        connectedById: ownerRow.id,
      },
    });

    const taskRes = await bffJson(ownerJar, `/api/workspace/projects/${projId}/tasks`, {
      method: "POST",
      body: { title: "Fix sum util", status: "TODO", priority: "HIGH" },
    });
    assert.equal(taskRes.status, 201);
    const task = taskRes.json;

    const baseCommitSha = "11223344556677889900";
    const runRow = await db.agentRun.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        taskId: task.id,
        projectRepositoryId: repoRow.id,
        triggeredById: devRow.id,
        status: "AWAITING_REVIEW",
        requestedPhase: "EXECUTE",
        repoFullName: repoRow.fullName,
        baseBranch: "main",
        baseCommitSha,
        taskSnapshotTitle: task.title,
        taskSnapshotHash: "hash",
        provider: "openai",
        model: "gpt-4o-mini",
      },
    });
    const planRow = await db.agentPlan.create({
      data: {
        runId: runRow.id,
        version: 1,
        status: "APPROVED",
        summary: "Fix sum util",
        steps: [],
        targetFiles: ["src/sum.js"],
        risks: [],
        suggestedChecks: [],
        contextSummary: {},
      },
    });
    const propRow = await db.agentProposal.create({
      data: {
        runId: runRow.id,
        planId: planRow.id,
        version: 1,
        status: "PENDING_REVIEW",
        summary: "Fix + operator in sum.js",
        reviewSummary: "Clean fix",
        reviewFindings: [],
        changedFiles: [],
        rawPatch: [
          "diff --git a/src/sum.js b/src/sum.js",
          "--- a/src/sum.js",
          "+++ b/src/sum.js",
          "@@ -1,3 +1,3 @@",
          " export function sum(a, b) {",
          "-  return a - b;",
          "+  return a + b;",
          " }",
        ].join("\n"),
        filesChangedCount: 1,
        additionsCount: 1,
        deletionsCount: 1,
        baseCommitSha,
      },
    });

    const pathKey = `ws_e2e_${runId}`;
    initializedPathKeys.push(pathKey);
    const tarball = createSafeTarGzFromEntries([
      { name: "repo-root/package.json", data: Buffer.from('{"name":"svc","version":"1.0.0"}\n', "utf8") },
      { name: "repo-root/src/sum.js", data: Buffer.from("export function sum(a, b) {\n  return a - b;\n}\n", "utf8") },
      { name: "repo-root/.env", data: Buffer.from("SECRET_KEY=topsecret\n", "utf8") },
    ]);

    const workerToken = await signJwt("devcollab-worker");
    const initWorkerRes = await fetch(`${worker}/workspaces/init`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pathKey,
        tarballBase64: tarball.toString("base64"),
        repoFullName: repoRow.fullName,
        baseBranch: "main",
        baseCommitSha,
      }),
    });
    assert.equal(initWorkerRes.status, 200);
    const initJson = await initWorkerRes.json();

    const wsRow = await db.devWorkspace.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        projectRepositoryId: repoRow.id,
        ownerId: devRow.id,
        taskId: task.id,
        name: "dev-service-ide",
        status: "READY",
        storageMode: "EPHEMERAL",
        storageWarning: "Ephemeral worker storage active.",
        repoFullName: repoRow.fullName,
        baseBranch: "main",
        baseCommitSha,
        currentBranch: "main",
        lastCommitSha: initJson.headSha,
        workspacePathKey: pathKey,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });

    // 5. Real file tree, lazy read, secret block, traversal block, optimistic save & version conflict
    const treeRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/tree`);
    assert.equal(treeRes.status, 200);
    assert.ok(treeRes.json.entries.some((e) => e.path === "src"));
    assert.equal(treeRes.json.entries.some((e) => e.path === ".env"), false);

    const envReadBlocked = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/file?path=.env`);
    assert.equal(envReadBlocked.status, 403);

    const travBlocked = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/file?path=../secret.txt`);
    assert.equal(travBlocked.status, 400);

    const fileRead = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/file?path=src/sum.js`);
    assert.equal(fileRead.status, 200);
    assert.match(fileRead.json.content, /a - b/);

    // Apply AI proposal cleanly via BFF!
    const applyPropRes = await bffJson(
      devJar,
      `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/apply-proposal`,
      { method: "POST", body: { proposalId: propRow.id } },
    );
    assert.ok([200, 201].includes(applyPropRes.status));
    assert.equal(applyPropRes.json.filesChanged, 1);

    // Outdated versionHash save fails with 409 conflict!
    const staleSaveRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/file`, {
      method: "PUT",
      body: { path: "src/sum.js", content: "// overwrite", expectedVersionHash: fileRead.json.versionHash },
    });
    assert.equal(staleSaveRes.status, 409);

    // Stage + local commit via BFF
    const stageRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/git/stage`, {
      method: "POST",
      body: {},
    });
    assert.ok([200, 201].includes(stageRes.status));
    assert.equal(stageRes.json.stagedCount, 1);
    assert.equal(stageRes.json.remotePushAllowed, false);

    const commitRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/git/commit`, {
      method: "POST",
      body: { message: "fix: sum addition locally" },
    });
    assert.ok([200, 201].includes(commitRes.status));
    assert.notEqual(commitRes.json.sha, initJson.headSha);

    // Create new file + capture snapshot
    const newFileRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/files`, {
      method: "POST",
      body: { type: "file", path: "notes.txt", content: "local uncommitted note" },
    });
    assert.ok([200, 201].includes(newFileRes.status));

    const snapRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/snapshots`, {
      method: "POST",
    });
    assert.ok([200, 201].includes(snapRes.status));

    // Terminal session request is cleanly rejected (503) when Docker runtime is missing on host
    const termRes = await bffJson(devJar, `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/terminal-session`, {
      method: "POST",
    });
    assert.equal(termRes.status, 503);
  } finally {
    const workerToken = await signJwt("devcollab-worker").catch(() => null);
    if (workerToken) {
      for (const pk of initializedPathKeys) {
        await fetch(`${worker}/workspaces/${encodeURIComponent(pk)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${workerToken}` },
        }).catch(() => {});
      }
    }
    if (createdOrgIds.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } }).catch(() => {});
    }
    if (createdInstallationIds.length > 0) {
      await db.gitHubAppInstallation
        .deleteMany({ where: { id: { in: createdInstallationIds } } })
        .catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await db.$disconnect();
  }
});
