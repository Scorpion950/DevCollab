import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import process from "node:process";
import { test } from "node:test";

const { AbortSignal, FormData, Headers, TextEncoder, URL, URLSearchParams, fetch, performance } =
  globalThis;

const require = createRequire(import.meta.url);
const { SignJWT } = require("jose");

const web = process.env.E2E_WEB_URL || "http://localhost:3000";
const api = process.env.E2E_API_URL || "http://localhost:4000/api";

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
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  clone() {
    const next = new CookieJar();
    for (const [k, v] of this.cookies.entries()) next.cookies.set(k, v);
    return next;
  }
}

async function fetchWithJar(jar, url, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookieHeader = jar.header();
  if (cookieHeader) headers.set("Cookie", cookieHeader);
  const res = await fetch(url, { ...init, headers, redirect: "manual", signal: AbortSignal.timeout(30_000) });
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
  if (jar.cookies.size > 0 && [...jar.cookies.keys()].some((k) => k.includes("session-token"))) {
    return;
  }

  // Fallback via Auth.js credentials callback if server action returned HTML redirect payload
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

async function signApiUserToken(userId, secret) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web")
    .setAudience("devcollab-api")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(new TextEncoder().encode(secret));
}

async function apiJson(userId, secret, path, method = "GET", body) {
  const token = await signApiUserToken(userId, secret);
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

test("Brick 3 End-to-End: auth routing, welcome skip removal, org/project RBAC, invitations, session revocation, and timings", async (t) => {
  const { getDatabase } = await import("@devcollab/database");
  const db = getDatabase();
  const secret = process.env.INTERNAL_AUTH_SECRET;
  assert.ok(secret && secret.length >= 32, "INTERNAL_AUTH_SECRET must be loaded in test environment");

  const runId = randomUUID().slice(0, 8);
  const ownerEmail = `e2e-owner-${runId}@example.com`;
  const memberEmail = `e2e-member-${runId}@example.com`;
  const password = "DevCollabTestPassword123!";
  const createdOrgIds = [];
  const createdUserIds = [];

  try {
    // 1. Anonymous route protection across all Brick 3 routes
    for (const path of ["/welcome", "/app", "/app/projects", "/app/members", "/app/invitations", "/app/settings", "/app/profile"]) {
      const res = await fetch(`${web}${path}`, { redirect: "manual" });
      assert.equal(res.status, 307, `${path} should redirect unauthenticated visitor`);
      assert.ok(res.headers.get("location")?.includes("/auth/sign-in"), `${path} redirect location`);
    }

    // 2. Public homepage renders normally for unauthenticated visitor
    const tHome = performance.now();
    const anonHome = await fetch(`${web}/`, { redirect: "manual" });
    const homeMs = performance.now() - tHome;
    assert.equal(anonHome.status, 200);
    const anonHomeHtml = await anonHome.text();
    assert.match(anonHomeHtml, /Build together\./);
    assert.ok(!anonHomeHtml.includes("Switch to Warm Off-White"), "Public homepage must remain dark");

    // 3. Register & sign in Owner
    const ownerJar = new CookieJar();
    await registerAndSignIn(ownerJar, { name: "Aarav Owner", email: ownerEmail, password });
    const ownerUser = await db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } });
    assert.ok(ownerUser, "Owner user should exist in DB");
    createdUserIds.push(ownerUser.id);

    // 4. Smart homepage, auth page redirects, logo href, and welcome screen check
    const authHomeRes = await fetchWithJar(ownerJar, `${web}/`);
    assert.equal(authHomeRes.status, 307, "Authenticated user on / should redirect directly to /app");
    assert.equal(new URL(authHomeRes.headers.get("location"), web).pathname, "/app");

    const authSignInRes = await fetchWithJar(ownerJar, `${web}/auth/sign-in`);
    assert.equal(authSignInRes.status, 307, "Authenticated user on /auth/sign-in should redirect to /app");

    const authHowRes = await fetchWithJar(ownerJar, `${web}/how-it-works`);
    assert.equal(authHowRes.status, 200);
    const authHowHtml = await authHowRes.text();
    assert.match(authHowHtml, /href="\/app"/, "Logo on public page for signed-in user must point to /app");

    const welcomeRes = await fetchWithJar(ownerJar, `${web}/welcome`);
    assert.equal(welcomeRes.status, 200);
    const welcomeHtml = await welcomeRes.text();
    assert.match(welcomeHtml, /Welcome,/);
    assert.match(welcomeHtml, /Aarav/);
    assert.ok(!welcomeHtml.includes("Skip introduction"), "Visible Skip button must be removed");

    // 5. First-time authenticated user with 0 orgs enters onboarding at /app
    const onboardingRes = await fetchWithJar(ownerJar, `${web}/app`);
    assert.equal(onboardingRes.status, 200);
    const onboardingHtml = await onboardingRes.text();
    assert.match(onboardingHtml, /Create your first organization/);

    // 6. Create two organizations via NestJS API and verify atomic Owner + multi-org switching
    const org1Res = await apiJson(ownerUser.id, secret, "/organizations", "POST", {
      name: `Yash Tech ${runId}`,
      slug: `yash-tech-${runId}`,
      description: "Primary organization",
    });
    assert.equal(org1Res.status, 201);
    createdOrgIds.push(org1Res.data.id);
    assert.equal(org1Res.data.role, "OWNER");

    const org2Res = await apiJson(ownerUser.id, secret, "/organizations", "POST", {
      name: `College Team ${runId}`,
      slug: `college-team-${runId}`,
    });
    assert.equal(org2Res.status, 201);
    createdOrgIds.push(org2Res.data.id);

    // 7. Create a project in Org 1 and a separate project in Org 2
    const proj1Res = await apiJson(ownerUser.id, secret, `/organizations/${org1Res.data.id}/projects`, "POST", {
      name: "Atlas API",
      key: "ATL",
      description: "Backend API",
    });
    assert.equal(proj1Res.status, 201);

    const proj2Res = await apiJson(ownerUser.id, secret, `/organizations/${org2Res.data.id}/projects`, "POST", {
      name: "Campus App",
      key: "CMP",
    });
    assert.equal(proj2Res.status, 201);

    // Cross-org IDOR check via HTTP API
    const crossOrg = await apiJson(
      ownerUser.id,
      secret,
      `/organizations/${org2Res.data.id}/projects/${proj1Res.data.id}`,
    );
    assert.equal(crossOrg.status, 404);

    // 8. Invite second user as MEMBER, inspect & accept invitation
    const invRes = await apiJson(
      ownerUser.id,
      secret,
      `/organizations/${org1Res.data.id}/invitations`,
      "POST",
      { email: memberEmail, role: "MEMBER" },
    );
    assert.equal(invRes.status, 201);

    // Unauthenticated visitor opening invitation link sees prompt to sign in/register
    const anonInviteRes = await fetch(`${web}/invitations/${invRes.data.token}`);
    assert.equal(anonInviteRes.status, 200);
    const anonInviteHtml = await anonInviteRes.text();
    assert.match(anonInviteHtml, /Sign in to accept/);

    // Register Member and accept invitation
    const memberJar = new CookieJar();
    await registerAndSignIn(memberJar, { name: "Riya Member", email: memberEmail, password });
    const memberUser = await db.user.findUnique({ where: { email: memberEmail }, select: { id: true } });
    assert.ok(memberUser);
    createdUserIds.push(memberUser.id);

    const acceptRes = await apiJson(memberUser.id, secret, "/invitations/accept", "POST", {
      token: invRes.data.token,
    });
    assert.equal(acceptRes.status, 201);
    assert.equal(acceptRes.data.organizationId, org1Res.data.id);

    // 9. Enforce RBAC in UI and API for ordinary Member vs Project Manager
    const memberAppRes = await fetchWithJar(memberJar, `${web}/app`);
    assert.equal(memberAppRes.status, 200);
    const memberAppHtml = await memberAppRes.text();
    assert.match(memberAppHtml, /Developer workspace/);
    assert.match(memberAppHtml, /Atlas API/);

    const memberOrgDash = await apiJson(memberUser.id, secret, `/organizations/${org1Res.data.id}/dashboard`);
    assert.equal(memberOrgDash.status, 403);

    const memberProjMgmtApi = await apiJson(
      memberUser.id,
      secret,
      `/organizations/${org1Res.data.id}/projects/${proj1Res.data.id}/management`,
    );
    assert.equal(memberProjMgmtApi.status, 403);

    const memberProjMgmtUi = await fetchWithJar(memberJar, `${web}/app/projects/${proj1Res.data.id}/manage`);
    assert.equal(memberProjMgmtUi.status, 200);
    assert.match(await memberProjMgmtUi.text(), /Project management restricted/);

    // Promote Member to Project Manager on Atlas API -> management unlocks!
    const promotePm = await apiJson(
      ownerUser.id,
      secret,
      `/organizations/${org1Res.data.id}/projects/${proj1Res.data.id}/roles`,
      "PUT",
      { userId: memberUser.id, role: "PROJECT_MANAGER" },
    );
    assert.equal(promotePm.status, 200);

    const pmMgmtApi = await apiJson(
      memberUser.id,
      secret,
      `/organizations/${org1Res.data.id}/projects/${proj1Res.data.id}/management`,
    );
    assert.equal(pmMgmtApi.status, 200);
    assert.equal(pmMgmtApi.data.project.key, "ATL");

    // 10. Verify Owner Dashboard, members, invitations, settings, profile, and light theme
    const ownerAppStart = performance.now();
    const ownerAppRes = await fetchWithJar(ownerJar, `${web}/app`);
    const ownerAppMs = performance.now() - ownerAppStart;
    assert.equal(ownerAppRes.status, 200);
    const ownerAppHtml = await ownerAppRes.text();
    assert.match(ownerAppHtml, /Organization overview/);
    assert.match(ownerAppHtml, /Atlas API/);
    assert.match(ownerAppHtml, /data-workspace-theme="dark"/);

    // Light theme cookie inside /app renders warm off-white theme without flashing
    const lightJar = ownerJar.clone();
    lightJar.cookies.set("devcollab.workspace.theme", "light");
    const lightAppRes = await fetchWithJar(lightJar, `${web}/app`);
    assert.equal(lightAppRes.status, 200);
    assert.match(await lightAppRes.text(), /data-workspace-theme="light"/);

    // Owner admin routes return 200; Member gets restricted view on admin routes
    for (const adminPath of ["/app/members", "/app/invitations", "/app/settings"]) {
      const ownerRoute = await fetchWithJar(ownerJar, `${web}${adminPath}`);
      assert.equal(ownerRoute.status, 200, `Owner should open ${adminPath}`);
      const memberRoute = await fetchWithJar(memberJar, `${web}${adminPath}`);
      assert.equal(memberRoute.status, 200, `Member gets friendly restricted UI on ${adminPath}`);
      assert.match(await memberRoute.text(), /restricted/i, `Member must see restricted state on ${adminPath}`);
    }

    const memberProfileRes = await fetchWithJar(memberJar, `${web}/app/profile`);
    assert.equal(memberProfileRes.status, 200);
    assert.match(await memberProfileRes.text(), /Profile &amp; organizations|Profile & organizations/);

    // Org switching updates active projects in /app
    const switchedJar = ownerJar.clone();
    switchedJar.cookies.set("devcollab.active.org", org2Res.data.id);
    const switchedAppHtml = await (await fetchWithJar(switchedJar, `${web}/app`)).text();
    assert.match(switchedAppHtml, new RegExp(`College Team ${runId}`));
    assert.match(switchedAppHtml, /Campus App/);
    assert.ok(!switchedAppHtml.includes("Atlas API"), "Org 1 project must not appear in Org 2 workspace");

    // 11. Logout revokes session so copied cookie cannot be reused
    const stolenJar = ownerJar.clone();
    const csrfRes = await fetchWithJar(ownerJar, `${web}/api/auth/csrf`);
    const { csrfToken } = await csrfRes.json();
    await fetchWithJar(ownerJar, `${web}/api/auth/signout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: web },
      body: new URLSearchParams({ csrfToken }).toString(),
    });

    const replayApp = await fetchWithJar(stolenJar, `${web}/app`);
    assert.equal(replayApp.status, 307, "Copied JWT cookie must be rejected after logout");
    assert.ok(replayApp.headers.get("location")?.includes("/auth/sign-in"));

    const replayHome = await fetchWithJar(stolenJar, `${web}/`);
    assert.equal(replayHome.status, 200, "Revoked session must no longer redirect / to /app");

    // 12. Warm navigation performance measurements
    const routesToTime = ["/", "/how-it-works", "/auth/sign-in", "/auth/sign-up"];
    const timings = { homeAnonMs: Math.round(homeMs), ownerDashboardMs: Math.round(ownerAppMs) };
    for (const path of routesToTime) {
      const s = performance.now();
      const r = await fetch(`${web}${path}`, { redirect: "manual" });
      await r.text();
      timings[path] = Math.round(performance.now() - s);
    }
    t.diagnostic(`Measured warm timings (ms): ${JSON.stringify(timings)}`);
  } finally {
    if (createdOrgIds.length > 0) {
      await db.organization.deleteMany({ where: { id: { in: createdOrgIds } } }).catch(() => {});
    }
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await db.$disconnect().catch(() => {});
  }
});
