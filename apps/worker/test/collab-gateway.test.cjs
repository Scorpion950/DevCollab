const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, readFile, rm, stat } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const Y = require("yjs");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");
const syncProtocol = require("y-protocols/sync");
const awarenessProtocol = require("y-protocols/awareness");
const { WebSocket } = require("ws");

const { createSafeTarGzFromEntries } = require("@devcollab/ai-core");
const { signHs256Jwt } = require("../dist/jwt.js");
const { createWorkerHttpServer } = require("../dist/worker-server.js");

const TEST_SECRET = "devcollab-brick8-collab-worker-secret-0123456789";

function buildRepoTarGz() {
  return createSafeTarGzFromEntries([
    {
      name: "acme-app-main/package.json",
      data: Buffer.from('{"name":"acme-app","version":"1.0.0"}\n', "utf8"),
    },
    {
      name: "acme-app-main/src/app.ts",
      data: Buffer.from("export const value = 'start';\n", "utf8"),
    },
    {
      name: "acme-app-main/.env",
      data: Buffer.from("SECRET_KEY=supersecret\n", "utf8"),
    },
  ]);
}

function makeConfig(rootDir, snapDir) {
  return {
    workerId: "worker-collab-test",
    pollIntervalMs: 2500,
    leaseDurationMs: 60_000,
    maxContextFiles: 24,
    maxContextBytes: 96_000,
    sandboxEnabled: false,
    sandboxDockerImage: "node:24-alpine",
    sandboxTimeoutMs: 10_000,
    workerHttpPort: 0,
    workerBindHost: "127.0.0.1",
    workerPublicWsUrl: "ws://127.0.0.1:0/terminal",
    internalAuthSecret: TEST_SECRET,
    workspaceRootDir: rootDir,
    workspaceSnapshotDir: snapDir,
    workspaceStorageMode: "EPHEMERAL",
    terminalEnabled: false,
    terminalAllowedOrigins: ["http://localhost:3000"],
    terminalIdleMs: 60_000,
    maxFileBytes: 65_536,
  };
}

function makeCollabToken(claims) {
  return signHs256Jwt(
    {
      iss: "devcollab-api",
      aud: "devcollab-worker-collab",
      exp: Math.floor(Date.now() / 1000) + 120,
      ...claims,
    },
    TEST_SECRET,
  );
}

function connectCollabClient({ wsUrl, filePath, token, origin = "http://localhost:3000" }) {
  return new Promise((resolve, reject) => {
    const doc = new Y.Doc();
    const yText = doc.getText("monaco");
    const awareness = new awarenessProtocol.Awareness(doc);
    const controls = [];
    let closedEvent = null;

    const url = `${wsUrl}?token=${encodeURIComponent(token)}&filePath=${encodeURIComponent(filePath)}`;
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    ws.binaryType = "arraybuffer";

    const sendBin = (bytes) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(bytes);
      }
    };

    doc.on("update", (update, originTag) => {
      if (originTag === "remote") return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      syncProtocol.writeUpdate(enc, update);
      sendBin(encoding.toUint8Array(enc));
    });

    awareness.on("update", ({ added, updated, removed }, originTag) => {
      if (originTag === "remote") return;
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 1);
      encoding.writeVarUint8Array(enc, awarenessProtocol.encodeAwarenessUpdate(awareness, changed));
      sendBin(encoding.toUint8Array(enc));
    });

    ws.on("open", () => {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, 0);
      syncProtocol.writeSyncStep1(enc, doc);
      sendBin(encoding.toUint8Array(enc));
    });

    ws.on("message", (raw) => {
      const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      const dec = decoding.createDecoder(new Uint8Array(buf));
      const ch = decoding.readVarUint(dec);
      if (ch === 0) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.readSyncMessage(dec, enc, doc, "remote");
        if (encoding.length(enc) > 1) sendBin(encoding.toUint8Array(enc));
      } else if (ch === 1) {
        const update = decoding.readVarUint8Array(dec);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, "remote");
      } else if (ch === 2) {
        const ctrl = JSON.parse(decoding.readVarString(dec));
        controls.push(ctrl);
        if (ctrl.type === "ready") {
          resolve({
            ws,
            doc,
            yText,
            awareness,
            controls,
            getClosedEvent: () => closedEvent,
            close: () => {
              awareness.destroy();
              doc.destroy();
              try {
                ws.terminate();
              } catch {}
            },
          });
        }
      }
    });

    ws.on("close", (code, reasonBuf) => {
      closedEvent = { code, reason: reasonBuf.toString("utf8") };
    });

    ws.on("unexpected-response", (_req, res) => {
      awareness.destroy();
      doc.destroy();
      reject(new Error(`UPGRADE_${res.statusCode}`));
    });

    ws.on("error", (err) => {
      awareness.destroy();
      doc.destroy();
      reject(err);
    });
  });
}

async function waitForCondition(fn, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 35));
  }
  throw new Error("Timed out waiting for condition");
}

test("CollabGateway enforces auth, origin, secret paths, dual-client CRDT convergence, viewer blocks, revocation, delete guard, flush-before-git, and restart recovery", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "dc-collab-rt-"));
  const rootDir = path.join(base, "workspaces");
  const snapDir = path.join(base, "snapshots");
  const srv = createWorkerHttpServer({ config: makeConfig(rootDir, snapDir) });
  const port = await srv.listen();
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/collab`;
  const pathKey = "ws_collab_001";
  const sessionId = "sess_collab_001";

  const authServiceHeader = () => ({
    Authorization: `Bearer ${signHs256Jwt(
      { iss: "devcollab-api", aud: "devcollab-worker", exp: Math.floor(Date.now() / 1000) + 30 },
      TEST_SECRET,
    )}`,
    "Content-Type": "application/json",
  });

  const openClients = [];
  const trackClient = (c) => {
    openClients.push(c);
    return c;
  };

  try {
    await srv.fsService.initializeFromTarball({
      pathKey,
      tarballBuffer: buildRepoTarGz(),
      repoFullName: "acme/app",
      baseBranch: "main",
      baseCommitSha: "deadbeef1234",
    });
    const repoDir = await srv.fsService.requireExistingRepoDir(pathKey);

    // 1. Reject unauthenticated, bad-origin, and restricted .env upgrades
    await assert.rejects(
      () =>
        connectCollabClient({
          wsUrl,
          filePath: "src/app.ts",
          token: "invalid.jwt.token",
        }),
      /UPGRADE_401/,
    );

    const ownerToken = makeCollabToken({
      sub: "user_owner",
      sessionId,
      workspaceId: "ws_1",
      pathKey,
      role: "OWNER",
      colorHex: "#3b82f6",
      displayName: "Owner",
    });

    await assert.rejects(
      () =>
        connectCollabClient({
          wsUrl,
          filePath: "src/app.ts",
          token: ownerToken,
          origin: "https://evil.example",
        }),
      /UPGRADE_403/,
    );

    await assert.rejects(
      () =>
        connectCollabClient({
          wsUrl,
          filePath: ".env",
          token: ownerToken,
        }),
      /UPGRADE_400/,
    );

    // 2. Concurrent dual-client editing & CRDT convergence
    const editorToken = makeCollabToken({
      sub: "user_editor",
      sessionId,
      workspaceId: "ws_1",
      pathKey,
      role: "EDITOR",
      colorHex: "#10b981",
      displayName: "Editor",
    });

    const clientA = trackClient(await connectCollabClient({ wsUrl, filePath: "src/app.ts", token: ownerToken }));
    const clientB = trackClient(await connectCollabClient({ wsUrl, filePath: "src/app.ts", token: editorToken }));

    await waitForCondition(() => clientA.yText.toString().includes("start"));
    await waitForCondition(() => clientB.yText.toString().includes("start"));

    // Awareness presence update + automatic disconnect cleanup test later
    clientB.awareness.setLocalStateField("user", { name: "Editor", color: "#10b981" });
    await waitForCondition(() => clientA.awareness.getStates().size >= 2);

    // Simultaneous non-overlapping & boundary edits
    clientA.doc.transact(() => {
      clientA.yText.insert(0, "// Header A\n");
    });
    clientB.doc.transact(() => {
      clientB.yText.insert(clientB.yText.length, "// Footer B\n");
    });

    await waitForCondition(() => clientA.yText.toString() === clientB.yText.toString() && clientA.yText.toString().includes("// Header A") && clientA.yText.toString().includes("// Footer B"));
    assert.equal(clientA.yText.toString(), clientB.yText.toString());

    // 3. Flush before Git status & local commit must include collaborative edits
    const gitStatusRes = await fetch(`${baseUrl}/workspaces/${pathKey}/git/status`, {
      headers: authServiceHeader(),
    });
    assert.equal(gitStatusRes.status, 200);
    const gitStatus = await gitStatusRes.json();
    assert.ok(gitStatus.files.some((f) => f.path === "src/app.ts"));

    const diskContentAfterFlush = await readFile(path.join(repoDir, "src", "app.ts"), "utf8");
    assert.equal(diskContentAfterFlush, clientA.yText.toString());

    // 4. Viewer role mutation rejection (cannot modify server Y.Doc or disk)
    const viewerToken = makeCollabToken({
      sub: "user_viewer",
      sessionId,
      workspaceId: "ws_1",
      pathKey,
      role: "VIEWER",
      colorHex: "#f59e0b",
      displayName: "Viewer",
    });
    const clientViewer = trackClient(await connectCollabClient({ wsUrl, filePath: "src/app.ts", token: viewerToken }));
    await waitForCondition(() => clientViewer.yText.toString().includes("// Header A"));
    const snapshotBeforeViewer = clientA.yText.toString();

    clientViewer.doc.transact(() => {
      clientViewer.yText.insert(0, "MALICIOUS_VIEWER_EDIT ");
    });
    await waitForCondition(() => clientViewer.controls.some((c) => c.type === "sync_rejected"));
    assert.equal(clientA.yText.toString(), snapshotBeforeViewer);

    // 5. Revoked participant immediately loses active WS socket (4403 + permission_revoked)
    const revokeRes = await fetch(`${baseUrl}/collab/sessions/${sessionId}/revoke`, {
      method: "POST",
      headers: authServiceHeader(),
      body: JSON.stringify({ userId: "user_editor", reason: "Removed during test" }),
    });
    assert.equal(revokeRes.status, 200);
    await waitForCondition(() => clientB.getClosedEvent()?.code === 4403);
    assert.ok(clientB.controls.some((c) => c.type === "permission_revoked"));

    // Awareness cleared after disconnect
    await waitForCondition(() => !Array.from(clientA.awareness.getStates().values()).some((s) => s?.user?.name === "Editor"));

    // 6. Durable persistence & restart recovery (evict memory -> reconnect reloads .bin cleanly)
    clientA.close();
    clientB.close();
    clientViewer.close();

    await srv.collabStore.evictMemoryForTesting(sessionId);
    const clientReconnected = trackClient(
      await connectCollabClient({ wsUrl, filePath: "src/app.ts", token: ownerToken }),
    );
    await waitForCondition(() => clientReconnected.yText.toString() === snapshotBeforeViewer);
    assert.equal(clientReconnected.yText.toString(), snapshotBeforeViewer);

    // 7. File delete coordination prevents stale client from recreating deleted file
    const delRes = await fetch(`${baseUrl}/workspaces/${pathKey}/delete-entry`, {
      method: "POST",
      headers: authServiceHeader(),
      body: JSON.stringify({ path: "src/app.ts" }),
    });
    assert.equal(delRes.status, 200);
    await waitForCondition(() => clientReconnected.controls.some((c) => c.type === "doc_deleted"));

    clientReconnected.doc.transact(() => {
      clientReconnected.yText.insert(0, "ZOMBIE_RECREATE");
    });
    await new Promise((r) => setTimeout(r, 150));
    await assert.rejects(() => stat(path.join(repoDir, "src", "app.ts")));

    // 8. Oversize/malformed frame does not crash gateway
    const malformedWs = new WebSocket(`${wsUrl}?token=${encodeURIComponent(ownerToken)}&filePath=package.json`, {
      headers: { Origin: "http://localhost:3000" },
    });
    openClients.push({
      close: () => {
        try {
          malformedWs.terminate();
        } catch {}
      },
    });
    await new Promise((r) => malformedWs.once("open", r));
    malformedWs.send(Buffer.from([0xff, 0xff, 0x01]));
    malformedWs.send("non-binary-frame");
    await new Promise((r) => setTimeout(r, 80));
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    malformedWs.terminate();
    clientReconnected.close();
  } finally {
    for (const c of openClients) {
      try {
        c.close();
      } catch {}
    }
    await srv.close();
    await rm(base, { recursive: true, force: true });
  }
});
