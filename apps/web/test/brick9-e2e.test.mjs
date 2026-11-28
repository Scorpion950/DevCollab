import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

const { AbortSignal, FormData, Headers, TextEncoder, URLSearchParams, fetch } = globalThis;

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
  const res = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(25_000) });
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

async function signJwt(audience, subject) {
  const key = new TextEncoder().encode(process.env.INTERNAL_AUTH_SECRET);
  let builder = new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web")
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("45s");
  if (subject) builder = builder.setSubject(subject);
  return builder.sign(key);
}

async function apiJson(userId, apiPath, init = {}) {
  const token = await signJwt("devcollab-api", userId);
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const res = await fetch(`${api}${apiPath}`, {
    ...init,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, json: text ? JSON.parse(text) : null };
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
  return { status: res.status, ok: res.ok, json };
}

test("Brick 9 E2E: Organization Analytics, Project Analytics, Personal Insights, Pricing Versioning, Budgets & Safe CSV Exports", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br9-${runId}-SecretPass!`;
  const ownerEmail = `brick9-${runId}-owner@example.com`;
  const devEmail = `brick9-${runId}-dev@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];

  try {
    const ownerJar = new CookieJar();
    const devJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick9 Owner", email: ownerEmail, password });
    await registerAndSignIn(devJar, { name: "Brick9 Dev", email: devEmail, password });

    const [ownerRow, devRow] = await Promise.all([
      db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: devEmail }, select: { id: true } }),
    ]);
    createdUserIds.push(ownerRow.id, devRow.id);

    // 1. Create Org and invite Developer
    const orgRes = await apiJson(ownerRow.id, "/organizations", {
      method: "POST",
      body: { name: `Brick9 Analytics ${runId}`, slug: `br9-${runId}` },
    });
    assert.equal(orgRes.status, 201);
    const orgId = orgRes.json.id;
    createdOrgIds.push(orgId);

    const invRes = await apiJson(ownerRow.id, `/organizations/${orgId}/invitations`, {
      method: "POST",
      body: { email: devEmail, role: "MEMBER" },
    });
    await apiJson(devRow.id, "/invitations/accept", {
      method: "POST",
      body: { token: invRes.json.token },
    });

    ownerJar.set("devcollab.active.org", orgId);
    devJar.set("devcollab.active.org", orgId);

    // 2. Create two projects: CORE (accessible to dev, formula-prefixed name test!) and SEC (restricted from dev)
    const proj1Res = await apiJson(ownerRow.id, `/organizations/${orgId}/projects`, {
      method: "POST",
      body: { name: "=SUM(1,2) Core Analytics", key: "BR9A" },
    });
    assert.equal(proj1Res.status, 201);
    const proj1Id = proj1Res.json.id;

    const proj2Res = await apiJson(ownerRow.id, `/organizations/${orgId}/projects`, {
      method: "POST",
      body: { name: "Restricted Org Vault", key: "BR9B" },
    });
    assert.equal(proj2Res.status, 201);
    const proj2Id = proj2Res.json.id;

    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/roles`, {
      method: "PUT",
      body: { userId: devRow.id, role: "DEVELOPER", canRunAi: true },
    });

    // 3. Create tasks exercising cycle time (IN_PROGRESS -> DONE), direct DONE (excluded from cycle), and archived
    const tCycle = await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks`, {
      method: "POST",
      body: { title: "Cycle timed task", assigneeId: devRow.id, priority: "HIGH" },
    });
    assert.equal(tCycle.status, 201);
    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks/${tCycle.json.id}`, {
      method: "PATCH",
      body: { status: "IN_PROGRESS" },
    });
    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks/${tCycle.json.id}`, {
      method: "PATCH",
      body: { status: "DONE" },
    });

    const tOpen = await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks`, {
      method: "POST",
      body: { title: "Overdue dev task", assigneeId: devRow.id, dueDate: "2026-01-01" },
    });
    assert.equal(tOpen.status, 201);

    const tArchived = await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks`, {
      method: "POST",
      body: { title: "Archived item" },
    });
    assert.equal(tArchived.status, 201);
    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${proj1Id}/tasks/${tArchived.json.id}/archive`, {
      method: "POST",
    });

    // 4. Verify SSR routes render cleanly
    const orgPageRes = await fetchWithJar(ownerJar, `${web}/app/analytics`);
    assert.equal(orgPageRes.status, 200);
    const orgHtml = await orgPageRes.text();
    assert.match(orgHtml, /Organization Analytics/);

    const projPageRes = await fetchWithJar(devJar, `${web}/app/projects/${proj1Id}/analytics`);
    assert.equal(projPageRes.status, 200);

    const personalPageRes = await fetchWithJar(devJar, `${web}/app/tasks?view=insights`);
    assert.equal(personalPageRes.status, 200);
    assert.match(await personalPageRes.text(), /My Tasks/);

    // 5. Verify strict RBAC across BFF endpoints
    assert.equal((await bffJson(devJar, "/api/workspace/analytics/organization")).status, 403);
    assert.equal(
      (await bffJson(devJar, "/api/workspace/analytics/pricing", {
        method: "POST",
        body: { provider: "openai", model: "gpt-4o", inputRatePer1m: 1, outputRatePer1m: 2 },
      })).status,
      403,
    );
    assert.equal((await bffJson(devJar, `/api/workspace/projects/${proj2Id}/analytics`)).status, 403);
    assert.equal(
      (await bffJson(devJar, `/api/workspace/projects/${proj1Id}/analytics/budget`, {
        method: "PUT",
        body: { period: "MONTHLY", currency: "USD", amountUsd: 50, warningThresholdPct: 80 },
      })).status,
      403,
    );
    assert.equal(
      (await fetchWithJar(devJar, `${web}/api/workspace/analytics/export?scope=organization`)).status,
      403,
    );

    // 6. Seed unreported + unpriced AI usage first to confirm honest unavailable states
    const conv = await db.aiConversation.create({
      data: {
        organizationId: orgId,
        projectId: proj1Id,
        userId: devRow.id,
        title: "Brick 9 usage test",
      },
    });
    await db.aiAssistantUsageRecord.create({
      data: {
        conversationId: conv.id,
        organizationId: orgId,
        projectId: proj1Id,
        userId: devRow.id,
        actionKind: "CHAT",
        provider: "openai",
        model: "gpt-4o-mini",
        usageAvailable: false,
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        costAvailable: false,
        currency: "USD",
        estimatedCostUsd: null,
        latencyMs: 120,
      },
    });

    const orgAnalytics1 = await bffJson(
      ownerJar,
      "/api/workspace/analytics/organization?preset=30d&timezone=UTC&refresh=1",
    );
    assert.equal(orgAnalytics1.status, 200);
    assert.equal(orgAnalytics1.json.delivery.archivedTasks, 1);
    assert.equal(orgAnalytics1.json.aiUsage.tokenUsageStatus, "UNAVAILABLE");
    assert.equal(orgAnalytics1.json.aiUsage.totalTokens, null);
    assert.equal(orgAnalytics1.json.aiUsage.costStatus, "PRICING_UNAVAILABLE");

    // 7. Publish Pricing v1, record costed event, publish Pricing v2 -> verify immutable v1 spend ($2.00)
    const p1 = await bffJson(ownerJar, "/api/workspace/analytics/pricing", {
      method: "POST",
      body: {
        provider: "openai",
        model: "gpt-4o-mini",
        currency: "USD",
        inputRatePer1m: "1.000000",
        outputRatePer1m: "2.000000",
        note: "Initial rate v1",
      },
    });
    assert.equal(p1.status, 201);
    assert.equal(p1.json.version, 1);

    await db.aiAssistantUsageRecord.create({
      data: {
        conversationId: conv.id,
        organizationId: orgId,
        projectId: proj1Id,
        userId: devRow.id,
        actionKind: "EXPLAIN",
        provider: "openai",
        model: "gpt-4o-mini",
        usageAvailable: true,
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        totalTokens: 1_500_000,
        pricingId: p1.json.id,
        costAvailable: true,
        currency: "USD",
        estimatedCostUsd: "2.000000",
        latencyMs: 310,
      },
    });

    const p2 = await bffJson(ownerJar, "/api/workspace/analytics/pricing", {
      method: "POST",
      body: {
        provider: "openai",
        model: "gpt-4o-mini",
        currency: "USD",
        inputRatePer1m: "25.000000",
        outputRatePer1m: "50.000000",
        note: "Updated rate v2",
      },
    });
    assert.equal(p2.status, 201);
    assert.equal(p2.json.version, 2);

    // 8. Save Organization Advisory Budget ($1.50) -> verify BUDGET_EXCEEDED + Audit event
    const budgetSave = await bffJson(ownerJar, "/api/workspace/analytics/budgets", {
      method: "PUT",
      body: { period: "MONTHLY", currency: "USD", amountUsd: "1.50", warningThresholdPct: 80 },
    });
    assert.equal(budgetSave.status, 200);
    assert.equal(budgetSave.json.state, "BUDGET_EXCEEDED");
    assert.equal(budgetSave.json.budget.hardEnforcementSupported, false);

    const orgAnalytics2 = await bffJson(
      ownerJar,
      "/api/workspace/analytics/organization?preset=30d&timezone=UTC&refresh=1",
    );
    assert.equal(orgAnalytics2.status, 200);
    assert.equal(orgAnalytics2.json.aiUsage.spendByCurrency[0].estimatedSpend, "2.000000");
    assert.ok(orgAnalytics2.json.budgetAuditEvents.length >= 1);

    // Also verify short-TTL cache hit behavior on immediate subsequent read
    const orgAnalyticsCached = await bffJson(
      ownerJar,
      "/api/workspace/analytics/organization?preset=30d&timezone=UTC",
    );
    assert.equal(orgAnalyticsCached.status, 200);
    assert.equal(orgAnalyticsCached.json.cachedHit, true);

    // 9. Verify Developer Personal Insights & Project Analytics
    const personalRes = await bffJson(
      devJar,
      "/api/workspace/analytics/personal?preset=30d&timezone=UTC",
    );
    assert.equal(personalRes.status, 200);
    assert.equal(personalRes.json.completedInPeriodCount, 1);
    assert.equal(personalRes.json.overdueAssignedCount, 1);
    assert.equal(personalRes.json.aiUsage.totalRequests, 2);

    const projAnalyticsRes = await bffJson(
      devJar,
      `/api/workspace/projects/${proj1Id}/analytics?preset=30d&timezone=UTC`,
    );
    assert.equal(projAnalyticsRes.status, 200);
    assert.equal(projAnalyticsRes.json.canManageBudget, false);
    assert.equal(projAnalyticsRes.json.lifecycle.cycleTimeSampleCount, 1);

    // 10. Invalid filter returns 400
    assert.equal(
      (await bffJson(
        ownerJar,
        "/api/workspace/analytics/organization?preset=custom&from=2026-11-10&to=2026-11-01",
      )).status,
      400,
    );

    // 11. Live CSV export attachment headers + formula neutralization (=SUM(1,2) escaped with ')
    const csvRes = await fetchWithJar(
      ownerJar,
      `${web}/api/workspace/analytics/export?scope=organization&dataset=delivery&preset=30d&timezone=UTC`,
    );
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get("content-type") || "", /^text\/csv/);
    assert.match(csvRes.headers.get("content-disposition") || "", /attachment;/);
    const csvText = await csvRes.text();
    assert.match(csvText, /"'=SUM\(1,2\) Core Analytics"/);
  } finally {
    if (createdOrgIds.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await db.$disconnect();
  }
});
