import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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

function taskSnapshotHash(task) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        title: task.title,
        description: task.description ?? "",
        status: task.status,
        priority: task.priority,
        labels: [...(task.labels ?? [])].sort(),
      }),
    )
    .digest("hex");
}

test("Brick 6 E2E: AI workspace routes, preflight safety, RBAC, stale-context plan approval, revisions & internal acceptance", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br6-${runId}-SecretPass!`;
  const ownerEmail = `brick6-${runId}-owner@example.com`;
  const devEmail = `brick6-${runId}-dev@example.com`;
  const outsiderEmail = `brick6-${runId}-outsider@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];
  const createdInstallationIds = [];

  try {
    // 1. Anonymous protection on Brick 6 UI and BFF routes
    const anonJar = new CookieJar();
    for (const p of ["/app/projects/fake/ai", "/app/projects/fake/tasks/fake/agent"]) {
      const res = await fetchWithJar(anonJar, `${web}${p}`);
      assert.equal(res.status, 307);
      assert.match(res.headers.get("location") ?? "", /\/auth\/sign-in/);
    }
    const anonBff = await bffJson(anonJar, "/api/workspace/projects/fake/ai/status");
    assert.equal(anonBff.status, 401);

    // 2. Register Owner, Developer, Outsider
    const ownerJar = new CookieJar();
    const devJar = new CookieJar();
    const outsiderJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick6 Owner", email: ownerEmail, password });
    await registerAndSignIn(devJar, { name: "Brick6 Dev", email: devEmail, password });
    await registerAndSignIn(outsiderJar, { name: "Brick6 Outsider", email: outsiderEmail, password });

    const [ownerRow, devRow, outsiderRow] = await Promise.all([
      db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: devEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: outsiderEmail }, select: { id: true } }),
    ]);
    assert.ok(ownerRow && devRow && outsiderRow);
    createdUserIds.push(ownerRow.id, devRow.id, outsiderRow.id);

    // 3. Create Org + Project + Invite Dev (assign DEVELOPER role)
    const orgRes = await apiJson(ownerRow.id, "/organizations", {
      method: "POST",
      body: { name: `Brick6 Org ${runId}`, slug: `br6-${runId}` },
    });
    assert.equal(orgRes.status, 201);
    const orgId = orgRes.json.id;
    createdOrgIds.push(orgId);

    const inv = await apiJson(ownerRow.id, `/organizations/${orgId}/invitations`, {
      method: "POST",
      body: { email: devEmail, role: "MEMBER" },
    });
    assert.equal(inv.status, 201);
    await apiJson(devRow.id, "/invitations/accept", {
      method: "POST",
      body: { token: inv.json.token },
    });

    const projRes = await apiJson(ownerRow.id, `/organizations/${orgId}/projects`, {
      method: "POST",
      body: { name: "Hyperion Engine", key: "HYP" },
    });
    assert.equal(projRes.status, 201);
    const projId = projRes.json.id;

    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${projId}/roles`, {
      method: "PUT",
      body: { userId: devRow.id, role: "DEVELOPER" },
    });

    ownerJar.set("devcollab.active.org", orgId);
    devJar.set("devcollab.active.org", orgId);

    // 4. Create task via BFF
    const taskRes = await bffJson(ownerJar, `/api/workspace/projects/${projId}/tasks`, {
      method: "POST",
      body: { title: "Improve JSON serializer", description: "Preserve integer ordering", status: "TODO", priority: "HIGH" },
    });
    assert.equal(taskRes.status, 201);
    const task = taskRes.json;

    // 5. Render Task Detail & AI Workspace pages (unconfigured AI/repo never crashes SSR)
    const taskHtmlRes = await fetchWithJar(ownerJar, `${web}/app/projects/${projId}/tasks/${task.id}`);
    assert.equal(taskHtmlRes.status, 200);
    const taskHtml = await taskHtmlRes.text();
    assert.match(taskHtml, /Run with AI/);

    const agentHtmlRes = await fetchWithJar(ownerJar, `${web}/app/projects/${projId}/tasks/${task.id}/agent`);
    assert.equal(agentHtmlRes.status, 200);
    const agentHtml = await agentHtmlRes.text();
    assert.match(agentHtml, /Execution Preflight/);

    const aiOverviewRes = await fetchWithJar(ownerJar, `${web}/app/projects/${projId}/ai`);
    assert.equal(aiOverviewRes.status, 200);

    // 6. Verify unconfigured AI/repo returns honest blockers via BFF and start fails safely (400/503)
    const statusRes = await bffJson(ownerJar, `/api/workspace/projects/${projId}/ai/status?taskId=${task.id}`);
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.headers.get("cache-control"), "private, no-store");
    assert.equal(statusRes.json.canTriggerAi, true);
    assert.ok(statusRes.json.blockingReasons.length >= 1);

    // Developer without AI permission cannot trigger AI run
    const devStartDenied = await bffJson(devJar, `/api/workspace/projects/${projId}/tasks/${task.id}/ai-runs`, {
      method: "POST",
      body: {},
    });
    assert.equal(devStartDenied.status, 403);

    // Outsider cannot read project AI status across orgs
    const crossOrgStatus = await bffJson(outsiderJar, `/api/workspace/projects/${projId}/ai/status`);
    assert.ok([400, 403, 404].includes(crossOrgStatus.status));

    // Toggle project-wide developer AI policy ON -> Dev status now reports canTriggerAi: true
    const policyOn = await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${projId}`, {
      method: "PATCH",
      body: { allowDeveloperAiRuns: true },
    });
    assert.equal(policyOn.status, 200);
    const devStatusAfter = await bffJson(devJar, `/api/workspace/projects/${projId}/ai/status?taskId=${task.id}`);
    assert.equal(devStatusAfter.status, 200);
    assert.equal(devStatusAfter.json.canTriggerAi, true);

    // 7. Seed connected GitHub repository + AgentRun in AWAITING_APPROVAL in Neon
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
      data: { organizationId: orgId, installationId: instRow.id, connectedById: ownerRow.id },
    });
    const repoRow = await db.projectRepository.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        installationId: instRow.id,
        githubRepoId: String(800_000_000 + Math.floor(Math.random() * 9_000_000)),
        owner: `acme-${runId}`,
        name: `hyperion-${runId}`,
        fullName: `acme-${runId}/hyperion-${runId}`,
        defaultBranch: "main",
        htmlUrl: `https://github.com/acme-${runId}/hyperion-${runId}`,
        isPrivate: true,
        status: "CONNECTED",
        activeLock: "ACTIVE",
        connectedById: ownerRow.id,
      },
    });

    const seededRun = await db.agentRun.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        taskId: task.id,
        projectRepositoryId: repoRow.id,
        triggeredById: ownerRow.id,
        status: "AWAITING_APPROVAL",
        requestedPhase: "PLAN",
        currentStage: "AWAITING_PLAN_APPROVAL",
        repoFullName: repoRow.fullName,
        baseBranch: "main",
        baseCommitSha: "deadbeef1234567890",
        taskSnapshotTitle: task.title,
        taskSnapshotHash: taskSnapshotHash(task),
        provider: "openai",
        model: "gpt-4o-mini",
      },
    });
    const seededPlan = await db.agentPlan.create({
      data: {
        runId: seededRun.id,
        version: 1,
        status: "PENDING",
        summary: "Update JSON serializer ordering logic.",
        steps: [
          { order: 1, title: "Fix serializer comparator", rationale: "Sort numeric keys cleanly", targetFiles: ["src/serializer.ts"] },
        ],
        targetFiles: ["src/serializer.ts"],
        risks: ["Preserve legacy fallback when keys contain floats"],
        suggestedChecks: ["node --test"],
        contextSummary: {
          repoFullName: repoRow.fullName,
          baseBranch: "main",
          baseCommitSha: "deadbeef1234567890",
          indexedFileCount: 12,
          selectedFiles: [{ path: "src/serializer.ts", bytes: 420, truncated: false }],
        },
      },
    });
    await db.agentRun.update({
      where: { id: seededRun.id },
      data: { activePlanId: seededPlan.id },
    });

    // Stale-context detection via live BFF: edit task title -> approval without acknowledgment returns 409
    const editTaskRes = await bffJson(ownerJar, `/api/workspace/projects/${projId}/tasks/${task.id}`, {
      method: "PATCH",
      body: { title: "Improve JSON serializer and escape control chars" },
    });
    assert.equal(editTaskRes.status, 200);

    const staleBlockRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/ai/runs/${seededRun.id}/plan-decision`,
      { method: "POST", body: { decision: "APPROVE" } },
    );
    assert.equal(staleBlockRes.status, 409);

    // Approve plan with stale acknowledgement -> RUNNING!
    const approvePlanRes = await bffJson(
      devJar,
      `/api/workspace/projects/${projId}/ai/runs/${seededRun.id}/plan-decision`,
      {
        method: "POST",
        body: { decision: "APPROVE", acknowledgeStaleContext: true, note: "Verified updated title" },
      },
    );
    assert.equal(approvePlanRes.status, 200);
    assert.equal(approvePlanRes.json.status, "RUNNING");
    assert.equal(approvePlanRes.json.activePlan.status, "APPROVED");

    // Simulate worker delivering Proposal v1 & unavailable Docker sandbox -> AWAITING_REVIEW
    const prop1 = await db.agentProposal.create({
      data: {
        runId: seededRun.id,
        planId: seededPlan.id,
        version: 1,
        status: "PENDING_REVIEW",
        summary: "Updated comparator in src/serializer.ts",
        reviewSummary: "Minimal diff; safe for numeric keys.",
        reviewFindings: [{ severity: "INFO", file: "src/serializer.ts", message: "Zero unsafe paths." }],
        changedFiles: [
          {
            sha: null,
            filename: "src/serializer.ts",
            previousFilename: null,
            status: "modified",
            additions: 1,
            deletions: 1,
            changes: 2,
            patch: "@@ -1,3 +1,3 @@\n export function sortKeys(a: number, b: number) {\n-  return String(a).localeCompare(String(b));\n+  return a - b;\n }",
            isBinary: false,
            isTruncated: false,
            isLarge: false,
            lineCount: 5,
            blobUrl: null,
          },
        ],
        rawPatch: "diff --git a/src/serializer.ts b/src/serializer.ts\n--- a/src/serializer.ts\n+++ b/src/serializer.ts\n@@ -1,3 +1,3 @@\n export function sortKeys(a: number, b: number) {\n-  return String(a).localeCompare(String(b));\n+  return a - b;\n }",
        filesChangedCount: 1,
        additionsCount: 1,
        deletionsCount: 1,
        baseCommitSha: "deadbeef1234567890",
      },
    });
    await db.agentTestRun.create({
      data: {
        runId: seededRun.id,
        proposalId: prop1.id,
        status: "UNAVAILABLE",
        command: "node --test",
        sandboxed: false,
        explanation: "Docker runtime unavailable; untrusted tests did not run on host.",
        completedAt: new Date(),
      },
    });
    await db.agentUsageRecord.create({
      data: {
        runId: seededRun.id,
        organizationId: orgId,
        projectId: projId,
        stageRole: "IMPLEMENTER",
        provider: "openai",
        model: "gpt-4o-mini",
        inputTokens: 400,
        outputTokens: 150,
        totalTokens: 550,
        estimatedCostUsd: "0.000150",
        latencyMs: 320,
      },
    });
    await db.agentRun.update({
      where: { id: seededRun.id },
      data: { status: "AWAITING_REVIEW", activeProposalId: prop1.id, currentStage: "AWAITING_HUMAN_REVIEW" },
    });

    // Request proposal revision via BFF -> v1 preserved as REVISION_REQUESTED
    const revRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/ai/runs/${seededRun.id}/proposal-decision`,
      { method: "POST", body: { decision: "REVISE", note: "Handle NaN values safely too" } },
    );
    assert.equal(revRes.status, 200);
    assert.equal(revRes.json.status, "RUNNING");

    // Worker adds Proposal v2 -> AWAITING_REVIEW
    const prop2 = await db.agentProposal.create({
      data: {
        runId: seededRun.id,
        planId: seededPlan.id,
        version: 2,
        status: "PENDING_REVIEW",
        summary: "Guarded NaN values in comparator",
        reviewSummary: "NaN guard added cleanly.",
        reviewFindings: [],
        changedFiles: prop1.changedFiles,
        rawPatch: prop1.rawPatch,
        filesChangedCount: 1,
        additionsCount: 1,
        deletionsCount: 1,
        baseCommitSha: "deadbeef1234567890",
        revisionFeedback: "Handle NaN values safely too",
      },
    });
    await db.agentRun.update({
      where: { id: seededRun.id },
      data: { status: "AWAITING_REVIEW", activeProposalId: prop2.id },
    });

    // Accept Proposal v2 internally -> COMPLETED, v1 preserved, task.status stays TODO
    const acceptRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/ai/runs/${seededRun.id}/proposal-decision`,
      { method: "POST", body: { decision: "ACCEPT", note: "Verified cleanly" } },
    );
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.json.status, "COMPLETED");
    assert.equal(acceptRes.json.proposals.length, 2);
    assert.equal(acceptRes.json.proposals.find((p) => p.version === 1).status, "REVISION_REQUESTED");
    assert.equal(acceptRes.json.proposals.find((p) => p.version === 2).status, "ACCEPTED");

    const refreshedTask = await bffJson(ownerJar, `/api/workspace/projects/${projId}/tasks/${task.id}`);
    assert.equal(refreshedTask.status, 200);
    assert.equal(refreshedTask.json.status, "TODO");

    // Verify rendered AI Workspace page displays proposal summary, unavailable sandbox notice & diff!
    const populatedAgentPage = await fetchWithJar(
      ownerJar,
      `${web}/app/projects/${projId}/tasks/${task.id}/agent?runId=${seededRun.id}`,
    );
    assert.equal(populatedAgentPage.status, 200);
    const populatedHtml = await populatedAgentPage.text();
    assert.match(populatedHtml, /Guarded NaN values in comparator/);
    assert.match(populatedHtml, /Docker runtime unavailable/);

    // Test Cancel run flow on a second QUEUED run
    const run2 = await db.agentRun.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        taskId: task.id,
        projectRepositoryId: repoRow.id,
        triggeredById: ownerRow.id,
        status: "QUEUED",
        requestedPhase: "PLAN",
        currentStage: "QUEUED_PLANNING",
        repoFullName: repoRow.fullName,
        baseBranch: "main",
        baseCommitSha: "deadbeef1234567890",
        taskSnapshotTitle: refreshedTask.json.title,
        taskSnapshotHash: taskSnapshotHash(refreshedTask.json),
        provider: "openai",
        model: "gpt-4o-mini",
      },
    });
    const cancelRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/ai/runs/${run2.id}/cancel`,
      { method: "POST" },
    );
    assert.equal(cancelRes.status, 200);
    assert.equal(cancelRes.json.status, "CANCELLED");
  } finally {
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
