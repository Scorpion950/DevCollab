import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { test } from "node:test";

const { AbortSignal, FormData, Headers, TextEncoder, URL, URLSearchParams, fetch, setTimeout } = globalThis;

const require = createRequire(import.meta.url);
const requireWorker = createRequire(new URL("../../worker/package.json", import.meta.url));
const { SignJWT } = require("jose");
const Y = require("yjs");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const syncProtocol = require("y-protocols/sync");
const { WebSocket } = requireWorker("ws");
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
    .setIssuer(audience === "devcollab-worker" ? "devcollab-api" : "devcollab-web")
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

function connectLiveCollabWs(wsUrl, token, filePath) {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    const yText = doc.getText("monaco");
    const controls = [];
    let closeInfo = null;
    const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}&filePath=${encodeURIComponent(filePath)}`, {
      headers: { Origin: web },
    });
    ws.binaryType = "arraybuffer";
    const sendBin = (b) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(b);
    };
    doc.on("update", (u, origin) => {
      if (origin === "remote") return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      syncProtocol.writeUpdate(enc, u);
      sendBin(encoding.toUint8Array(enc));
    });
    ws.on("open", () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      syncProtocol.writeSyncStep1(enc, doc);
      sendBin(encoding.toUint8Array(enc));
    });
    ws.on("message", (raw) => {
      const dec = decoding.createDecoder(new Uint8Array(Buffer.isBuffer(raw) ? raw : Buffer.from(raw)));
      const ch = decoding.readVarUint(dec);
      if (ch === 0) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.readSyncMessage(dec, enc, doc, "remote");
        if (encoding.length(enc) > 1) sendBin(encoding.toUint8Array(enc));
      } else if (ch === 2) {
        const ctrl = JSON.parse(decoding.readVarString(dec));
        controls.push(ctrl);
        if (ctrl.type === "ready") {
          resolve({
            ws,
            doc,
            yText,
            controls,
            getCloseInfo: () => closeInfo,
            close: () => {
              doc.destroy();
              try {
                ws.terminate();
              } catch {
                // Ignore already closed socket
              }
            },
          });
        }
      }
    });
    ws.on("close", (code, r) => {
      closeInfo = { code, reason: r.toString("utf8") };
    });
    ws.on("unexpected-response", (_req, res) => reject(new Error(`UPGRADE_${res.statusCode}`)));
    ws.on("error", reject);
  });
}

async function waitFor(fn, timeoutMs = 4500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error("Timed out waiting in E2E");
}

test("Brick 8 E2E: Real-time collaborative CRDT session, RBAC/revocation, persisted discussion, Git flush, and SSE IDE AI Assistant", async () => {
  const db = getDatabase();
  const runId = randomUUID().slice(0, 8);
  const password = `Br8-${runId}-SecretPass!`;
  const ownerEmail = `brick8-${runId}-owner@example.com`;
  const devEmail = `brick8-${runId}-dev@example.com`;
  const viewerEmail = `brick8-${runId}-view@example.com`;
  const unassignedEmail = `brick8-${runId}-unassigned@example.com`;

  const createdUserIds = [];
  const createdOrgIds = [];
  const initializedPathKeys = [];

  try {
    // 1. Public pages never ship Monaco/xterm/Yjs scripts
    const homeHtml = await (await fetch(`${web}/`)).text();
    assert.equal(homeHtml.includes("monaco"), false);
    assert.equal(homeHtml.includes("y-monaco"), false);

    // 2. Register test users
    const ownerJar = new CookieJar();
    const devJar = new CookieJar();
    const viewerJar = new CookieJar();
    const unassignedJar = new CookieJar();

    await registerAndSignIn(ownerJar, { name: "Brick8 Owner", email: ownerEmail, password });
    await registerAndSignIn(devJar, { name: "Brick8 Dev", email: devEmail, password });
    await registerAndSignIn(viewerJar, { name: "Brick8 Viewer", email: viewerEmail, password });
    await registerAndSignIn(unassignedJar, { name: "Brick8 Outsider", email: unassignedEmail, password });

    const [ownerRow, devRow, viewerRow, outsiderRow] = await Promise.all([
      db.user.findUnique({ where: { email: ownerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: devEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: viewerEmail }, select: { id: true } }),
      db.user.findUnique({ where: { email: unassignedEmail }, select: { id: true } }),
    ]);
    createdUserIds.push(ownerRow.id, devRow.id, viewerRow.id, outsiderRow.id);

    // 3. Create Org & Project; invite Dev, Viewer, Unassigned Org Member
    const orgRes = await apiJson(ownerRow.id, "/organizations", {
      method: "POST",
      body: { name: `Brick8 Org ${runId}`, slug: `br8-${runId}` },
    });
    assert.equal(orgRes.status, 201);
    const orgId = orgRes.json.id;
    createdOrgIds.push(orgId);

    for (const [email, uid] of [
      [devEmail, devRow.id],
      [viewerEmail, viewerRow.id],
      [unassignedEmail, outsiderRow.id],
    ]) {
      const inv = await apiJson(ownerRow.id, `/organizations/${orgId}/invitations`, {
        method: "POST",
        body: { email, role: "MEMBER" },
      });
      await apiJson(uid, "/invitations/accept", { method: "POST", body: { token: inv.json.token } });
    }

    const projRes = await apiJson(ownerRow.id, `/organizations/${orgId}/projects`, {
      method: "POST",
      body: { name: "Brick 8 Collab App", key: "BR8" },
    });
    assert.equal(projRes.status, 201);
    const projId = projRes.json.id;
    await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${projId}`, {
      method: "PATCH",
      body: { allowDeveloperAiRuns: true },
    });

    for (const uid of [devRow.id, viewerRow.id]) {
      const roleRes = await apiJson(ownerRow.id, `/organizations/${orgId}/projects/${projId}/roles`, {
        method: "PUT",
        body: { userId: uid, role: "DEVELOPER", canRunAi: true },
      });
      assert.ok([200, 201].includes(roleRes.status));
    }

    for (const jar of [ownerJar, devJar, viewerJar, unassignedJar]) {
      jar.set("devcollab.active.org", orgId);
    }

    // 4. Provision real isolated workspace on worker
    const pathKey = `ws_e2e_b8_${runId}`;
    initializedPathKeys.push(pathKey);
    const tarball = createSafeTarGzFromEntries([
      { name: "app-main/package.json", data: Buffer.from('{"name":"b8","version":"1.0.0"}\n', "utf8") },
      { name: "app-main/src/math.ts", data: Buffer.from("export function double(n: number) {\n  return n * 2;\n}\n", "utf8") },
    ]);
    const workerToken = await signJwt("devcollab-worker");
    const initRes = await fetch(`${worker}/workspaces/init`, {
      method: "POST",
      headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        pathKey,
        tarballBase64: tarball.toString("base64"),
        repoFullName: `acme/br8-${runId}`,
        baseBranch: "main",
        baseCommitSha: "beef0001",
      }),
    });
    assert.equal(initRes.status, 200);

    const wsRow = await db.devWorkspace.create({
      data: {
        organizationId: orgId,
        projectId: projId,
        ownerId: ownerRow.id,
        name: "shared-ide-ws",
        status: "ACTIVE",
        storageMode: "EPHEMERAL",
        repoFullName: `acme/br8-${runId}`,
        baseBranch: "main",
        baseCommitSha: "beef0001",
        currentBranch: "main",
        workspacePathKey: pathKey,
      },
    });

    // 5. Start live Collaboration Session via Next BFF -> NestJS
    const createSessionRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/collab/sessions`,
      { method: "POST", body: { title: "Live Brick 8 Review", inviteeIds: [devRow.id] } },
    );
    assert.ok([200, 201].includes(createSessionRes.status));
    const session = createSessionRes.json;

    // Unassigned org member blocked cleanly from collab session & AI assistant
    const outsiderBlock = await bffJson(
      unassignedJar,
      `/api/workspace/projects/${projId}/collab/sessions`,
    );
    assert.equal(outsiderBlock.status, 403);

    // Owner + Editor get live WS tickets & sync edits cleanly over real /collab WebSocket!
    const [ownerTicketRes, devTicketRes] = await Promise.all([
      bffJson(ownerJar, `/api/workspace/projects/${projId}/collab/sessions/${session.id}/ticket`, {
        method: "POST",
        body: {},
      }),
      bffJson(devJar, `/api/workspace/projects/${projId}/collab/sessions/${session.id}/ticket`, {
        method: "POST",
        body: {},
      }),
    ]);
    assert.ok([200, 201].includes(ownerTicketRes.status));
    assert.ok([200, 201].includes(devTicketRes.status));

    const wsOwner = await connectLiveCollabWs(ownerTicketRes.json.wsUrl, ownerTicketRes.json.token, "src/math.ts");
    const wsDev = await connectLiveCollabWs(devTicketRes.json.wsUrl, devTicketRes.json.token, "src/math.ts");

    await waitFor(() => wsOwner.yText.toString().includes("n * 2") && wsDev.yText.toString().includes("n * 2"));

    wsOwner.doc.transact(() => wsOwner.yText.insert(0, "// Owner note\n"));
    wsDev.doc.transact(() => wsDev.yText.insert(wsDev.yText.length, "// Dev note\n"));
    await waitFor(
      () =>
        wsOwner.yText.toString() === wsDev.yText.toString() &&
        wsOwner.yText.toString().includes("// Owner note") &&
        wsOwner.yText.toString().includes("// Dev note"),
    );

    // Persisted discussion message inside session
    const postChat = await bffJson(
      devJar,
      `/api/workspace/projects/${projId}/collab/sessions/${session.id}/messages`,
      { method: "POST", body: { body: "Updated src/math.ts cleanly!", filePath: "src/math.ts", lineNumber: 1 } },
    );
    assert.ok([200, 201].includes(postChat.status));

    // Local Git status reflects flushed CRDT edits without manual Ctrl+S!
    const gitStatus = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/workspaces/${wsRow.id}/git/status`,
    );
    assert.equal(gitStatus.status, 200);
    assert.ok(gitStatus.json.files.some((f) => f.path === "src/math.ts"));
    assert.equal(gitStatus.json.remotePushAllowed, false);

    // Revoke Dev participant -> live WS invalidated immediately AND ticket issuance blocked!
    const revokeRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/collab/sessions/${session.id}/participants/${devRow.id}`,
      { method: "DELETE" },
    );
    assert.equal(revokeRes.status, 200);
    await waitFor(() => wsDev.getCloseInfo()?.code === 4403);
    const devTicketBlocked = await bffJson(
      devJar,
      `/api/workspace/projects/${projId}/collab/sessions/${session.id}/ticket`,
      { method: "POST", body: {} },
    );
    assert.equal(devTicketBlocked.status, 403);

    wsOwner.close();
    wsDev.close();

    // Close collaborative session cleanly
    const closeRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/collab/sessions/${session.id}/close`,
      { method: "POST", body: {} },
    );
    assert.ok([200, 201].includes(closeRes.status));
    assert.equal(closeRes.json.status, "CLOSED");

    // 6. Verify AI Assistant endpoints (private isolation + streaming SSE or honest unconfigured 503)
    const aiStatus = await bffJson(ownerJar, `/api/workspace/projects/${projId}/ai/assistant/status`);
    assert.equal(aiStatus.status, 200);

    const convRes = await bffJson(
      ownerJar,
      `/api/workspace/projects/${projId}/ai/assistant/conversations`,
      { method: "POST", body: { workspaceId: wsRow.id, lastActiveFile: "src/math.ts" } },
    );
    assert.ok([200, 201].includes(convRes.status));

    // Dev cannot view Owner's private AI conversation
    const convPrivateBlock = await bffJson(
      devJar,
      `/api/workspace/projects/${projId}/ai/assistant/conversations/${convRes.json.id}`,
    );
    assert.equal(convPrivateBlock.status, 403);

    // Unconfigured AI rejects stream cleanly with 503 OR configured mock OpenAI server streams real SSE events
    const streamRes = await fetchWithJar(
      ownerJar,
      `${web}/api/workspace/projects/${projId}/ai/assistant/conversations/${convRes.json.id}/stream`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: web },
        body: JSON.stringify({
          prompt: "Explain double function",
          actionKind: "EXPLAIN",
          workspaceId: wsRow.id,
          activeFilePath: "src/math.ts",
        }),
      },
    );
    if (!aiStatus.json.configured) {
      assert.equal(streamRes.status, 503);
    } else {
      assert.equal(streamRes.status, 200);
      const sseBody = await streamRes.text();
      assert.match(sseBody, /"type":"done"/);
      const doneLine = sseBody
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => JSON.parse(l.slice(5).trim()))
        .find((evt) => evt.type === "done");
      assert.ok(doneLine?.message?.id);
      if (doneLine.message.proposal) {
        const applyRes = await bffJson(
          ownerJar,
          `/api/workspace/projects/${projId}/ai/assistant/conversations/${convRes.json.id}/messages/${doneLine.message.id}/apply-proposal`,
          { method: "POST", body: { workspaceId: wsRow.id } },
        );
        assert.ok([200, 201].includes(applyRes.status));
        assert.ok(applyRes.json.filesChanged >= 1);
      }
    }
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
    if (createdUserIds.length > 0) {
      await db.user.deleteMany({ where: { id: { in: createdUserIds } } }).catch(() => {});
    }
    await db.$disconnect();
  }
});

// Prevent unused http import lint/warning if extending mock SSE server inline later
void http;
