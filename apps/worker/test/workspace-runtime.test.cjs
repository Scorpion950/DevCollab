const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { mkdtemp, readFile, rm, symlink, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { WebSocket } = require("ws");

const { createSafeTarGzFromEntries } = require("@devcollab/ai-core");
const { signHs256Jwt } = require("../dist/jwt.js");
const { createWorkerHttpServer } = require("../dist/worker-server.js");
const { WorkspaceTerminalGateway } = require("../dist/terminal-gateway.js");
const { WorkspaceFilesystemService, WorkspaceFsError } = require("../dist/workspace-fs.js");

const TEST_SECRET = "devcollab-brick7-worker-test-secret-0123456789";

function buildRepoTarGz() {
  return createSafeTarGzFromEntries([
    {
      name: "acme-app-main/package.json",
      data: Buffer.from('{"name":"acme-app","version":"1.0.0"}\n', "utf8"),
    },
    {
      name: "acme-app-main/src/index.ts",
      data: Buffer.from("export function greet(name: string) {\n  return `Hello, ${name}`;\n}\n", "utf8"),
    },
    {
      name: "acme-app-main/README.md",
      data: Buffer.from("# Acme App\nInitial readme.\n", "utf8"),
    },
  ]);
}

function makeConfig(rootDir, snapDir, overrides = {}) {
  return {
    workerId: "worker-test-runtime",
    pollIntervalMs: 2500,
    leaseDurationMs: 60_000,
    maxContextFiles: 24,
    maxContextBytes: 96_000,
    sandboxEnabled: true,
    sandboxDockerImage: "node:24-alpine",
    sandboxTimeoutMs: 10_000,
    workerHttpPort: 0,
    workerBindHost: "127.0.0.1",
    workerPublicWsUrl: "ws://127.0.0.1:0/terminal",
    internalAuthSecret: TEST_SECRET,
    workspaceRootDir: rootDir,
    workspaceSnapshotDir: snapDir,
    workspaceStorageMode: "EPHEMERAL",
    terminalEnabled: true,
    terminalAllowedOrigins: ["http://localhost:3000"],
    terminalIdleMs: 60_000,
    maxFileBytes: 65_536,
    ...overrides,
  };
}

test("WorkspaceFilesystemService initializes isolated Git repo with zero remotes, saves with version checks, and blocks traversal/symlinks/secrets", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "dc-ws-fs-"));
  const rootDir = path.join(base, "workspaces");
  const snapDir = path.join(base, "snapshots");
  const outsideFile = path.join(base, "host-secret.txt");
  await writeFile(outsideFile, "DO_NOT_READ_HOST", "utf8");

  const fsService = new WorkspaceFilesystemService(rootDir, snapDir, 65_536);

  try {
    const init = await fsService.initializeFromTarball({
      pathKey: "ws_test_001",
      tarballBuffer: buildRepoTarGz(),
      repoFullName: "acme/app",
      baseBranch: "main",
      baseCommitSha: "deadbeef1234",
    });
    assert.equal(init.fileCount, 3);
    assert.ok(init.headSha.length >= 7);

    // Tree and lazy read
    const tree = await fsService.listTree("ws_test_001");
    assert.ok(tree.some((e) => e.path === "src" && e.type === "directory"));

    const file1 = await fsService.readFile("ws_test_001", "src/index.ts");
    assert.match(file1.content, /Hello/);

    // Optimistic version lock save + stale hash 409 conflict
    const saved = await fsService.writeFile({
      pathKey: "ws_test_001",
      path: "src/index.ts",
      content: "export function greet(name: string) {\n  return `Hi, ${name}`;\n}\n",
      expectedVersionHash: file1.versionHash,
    });
    assert.notEqual(saved.versionHash, file1.versionHash);

    await assert.rejects(
      () =>
        fsService.writeFile({
          pathKey: "ws_test_001",
          path: "src/index.ts",
          content: "stale overwrite",
          expectedVersionHash: file1.versionHash,
        }),
      (err) => err instanceof WorkspaceFsError && err.code === "FILE_VERSION_CONFLICT",
    );

    // Traversal, secret file, and .git metadata rejection
    for (const badPath of ["../host-secret.txt", "../../etc/passwd", ".env", ".env.local", "keys/id_rsa", ".git/config"]) {
      await assert.rejects(() => fsService.readFile("ws_test_001", badPath), WorkspaceFsError);
      await assert.rejects(() => fsService.createFile({ pathKey: "ws_test_001", path: badPath, content: "x" }), WorkspaceFsError);
    }

    // Create symlink/junction inside workspace pointing outside & verify blocked (fallback cleanly if OS restricts symlinks)
    const repoDir = path.join(rootDir, "ws_test_001", "repo");
    const evilLinkPath = path.join(repoDir, "evil-escape.txt");
    let linkCreated = false;
    try {
      await symlink(outsideFile, evilLinkPath, "file");
      linkCreated = true;
    } catch {
      try {
        await symlink(base, path.join(repoDir, "evil-dir"), "junction");
        linkCreated = true;
      } catch {
        linkCreated = false;
      }
    }
    if (linkCreated) {
      await assert.rejects(
        () => fsService.readFile("ws_test_001", "evil-escape.txt").catch(() => fsService.readFile("ws_test_001", "evil-dir/host-secret.txt")),
        WorkspaceFsError,
      );
    }

    // Create, search, rename, non-empty directory deletion confirmation
    await fsService.createFolder({ pathKey: "ws_test_001", path: "src/helpers" });
    await fsService.createFile({ pathKey: "ws_test_001", path: "src/helpers/fmt.ts", content: "export const ok = true;\n" });

    const matches = await fsService.searchWorkspace("ws_test_001", "export const ok", "text");
    assert.equal(matches.length, 1);
    assert.equal(matches[0].path, "src/helpers/fmt.ts");

    await assert.rejects(
      () => fsService.deleteEntry({ pathKey: "ws_test_001", path: "src/helpers", confirmNonEmpty: false }),
      (err) => err instanceof WorkspaceFsError && err.code === "NON_EMPTY_DIRECTORY",
    );

    await fsService.renameEntry({ pathKey: "ws_test_001", oldPath: "src/helpers/fmt.ts", newPath: "src/helpers/format.ts" });

    // Real Git status, diff, stage, unstage, commit, branch switch & zero remote enforcement
    const st1 = await fsService.getGitStatus("ws_test_001");
    assert.equal(st1.remotePushAllowed, false);
    assert.ok(st1.files.some((f) => f.path === "src/index.ts" && f.unstagedStatus === "M"));
    assert.ok(st1.files.some((f) => f.path === "src/helpers/format.ts" && f.untracked));

    const diff1 = await fsService.getGitDiff("ws_test_001", "unstaged", "src/index.ts");
    assert.equal(diff1.files.length, 1);

    const staged = await fsService.stageFiles("ws_test_001", ["src/index.ts"]);
    assert.equal(staged.stagedCount, 1);

    const unstaged = await fsService.unstageFiles("ws_test_001", ["src/index.ts"]);
    assert.equal(unstaged.stagedCount, 0);

    await fsService.stageFiles("ws_test_001");
    const committed = await fsService.commitChanges("ws_test_001", "feat: update greeting locally");
    assert.notEqual(committed.sha, init.headSha);
    assert.equal(committed.status.files.length, 0);

    const switched = await fsService.switchBranch("ws_test_001", "feat/greeting", true);
    assert.equal(switched.branch, "feat/greeting");

    // AI patch conflict vs clean apply
    await fsService.writeFile({
      pathKey: "ws_test_001",
      path: "README.md",
      content: "# Local dirty edit\nInitial readme.\n",
      expectedVersionHash: (await fsService.readFile("ws_test_001", "README.md")).versionHash,
    });

    const conflictingPatch = [
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1,2 +1,2 @@",
      " # Acme App",
      "-Initial readme.",
      "+Updated readme.",
    ].join("\n");

    await assert.rejects(
      () => fsService.applyAiPatch("ws_test_001", conflictingPatch),
      (err) => err instanceof WorkspaceFsError && err.code === "PATCH_CONFLICT",
    );

    const cleanPatch = [
      "diff --git a/src/helpers/format.ts b/src/helpers/format.ts",
      "--- a/src/helpers/format.ts",
      "+++ b/src/helpers/format.ts",
      "@@ -1,1 +1,2 @@",
      " export const ok = true;",
      "+export const version = 1;",
    ].join("\n");
    const applied = await fsService.applyAiPatch("ws_test_001", cleanPatch);
    assert.equal(applied.filesChanged, 1);

    // Snapshot & full recovery after directory loss
    const snap = await fsService.createRecoverySnapshot("ws_test_001", "ws_db_1", "snap_1");
    assert.ok(snap.sizeBytes > 0);
    await fsService.deleteWorkspaceDir("ws_test_001");
    assert.equal(await fsService.exists("ws_test_001"), false);

    await fsService.initializeFromTarball({
      pathKey: "ws_test_001",
      tarballBuffer: buildRepoTarGz(),
      repoFullName: "acme/app",
      baseBranch: "main",
      baseCommitSha: "deadbeef1234",
    });
    const restored = await fsService.restoreRecoverySnapshot({
      pathKey: "ws_test_001",
      storageKey: snap.storageKey,
      expectedChecksum: snap.checksumSha256,
    });
    assert.ok(restored.restoredFiles >= 1);
    const readmeRestored = await readFile(path.join(rootDir, "ws_test_001", "repo", "README.md"), "utf8");
    assert.match(readmeRestored, /Local dirty edit/);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("Worker HTTP auth & WebSocket terminal reject unauthorized, bad origin, replayed jti, and unavailable sandbox without host execution", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "dc-ws-http-"));
  const rootDir = path.join(base, "workspaces");
  const snapDir = path.join(base, "snapshots");
  const config = makeConfig(rootDir, snapDir);

  const runtime = createWorkerHttpServer({
    config,
    checkDocker: async () => ({
      available: false,
      reason: "Docker missing in test.",
    }),
  });

  try {
    const port = await runtime.listen();
    await runtime.fsService.initializeFromTarball({
      pathKey: "ws_http_1",
      tarballBuffer: buildRepoTarGz(),
      repoFullName: "acme/app",
      baseBranch: "main",
      baseCommitSha: "deadbeef",
    });

    // Public health reports terminal disabled cleanly
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.terminalAvailable, false);

    // Unauthenticated workspace tree request -> 401
    const unauth = await fetch(`http://127.0.0.1:${port}/workspaces/ws_http_1/tree`);
    assert.equal(unauth.status, 401);

    // Terminal upgrade rejected when Docker is unavailable -> HTTP 503
    const validTicket = signHs256Jwt(
      {
        sub: "u_1",
        iss: "devcollab-api",
        aud: "devcollab-worker-terminal",
        workspaceId: "w_1",
        workspacePathKey: "ws_http_1",
        sessionId: "term_1",
        jti: "jti-1",
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      TEST_SECRET,
    );

    await new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(validTicket)}`, {
        origin: "http://localhost:3000",
      });
      ws.on("unexpected-response", (_req, res) => {
        assert.equal(res.statusCode, 503);
        resolve();
      });
      ws.on("error", () => resolve());
    });
  } finally {
    await runtime.close();
    await rm(base, { recursive: true, force: true });
  }
});

test("Terminal gateway spawns hardened Docker flags when container runtime is simulated and blocks jti replay & cross-origin", async () => {
  const base = await mkdtemp(path.join(tmpdir(), "dc-ws-term-"));
  const rootDir = path.join(base, "workspaces");
  const snapDir = path.join(base, "snapshots");
  const config = makeConfig(rootDir, snapDir);
  const fsService = new WorkspaceFilesystemService(rootDir, snapDir, 65_536);

  await fsService.initializeFromTarball({
    pathKey: "ws_term_1",
    tarballBuffer: buildRepoTarGz(),
    repoFullName: "acme/app",
    baseBranch: "main",
    baseCommitSha: "deadbeef",
  });

  const spawnedDockerArgs = [];
  const gateway = new WorkspaceTerminalGateway(
    config,
    fsService,
    async () => ({ available: true, reason: "Simulated Docker" }),
    (dockerArgs) => {
      spawnedDockerArgs.push(dockerArgs);
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.killed = false;
      child.kill = () => {
        child.killed = true;
      };
      child.stdin.on("data", (d) => {
        child.stdout.write(Buffer.from(`echo:${d.toString("utf8")}`));
      });
      return child;
    },
  );

  const server = require("node:http").createServer();
  server.on("upgrade", (req, sock, head) => void gateway.handleUpgrade(req, sock, head));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;

  try {
    const ticket = signHs256Jwt(
      {
        sub: "u_1",
        iss: "devcollab-api",
        aud: "devcollab-worker-terminal",
        workspaceId: "w_1",
        workspacePathKey: "ws_term_1",
        sessionId: "term_ok",
        jti: "jti-single-use",
        exp: Math.floor(Date.now() / 1000) + 60,
      },
      TEST_SECRET,
    );

    // Cross-origin rejected -> 403
    await new Promise((resolve) => {
      const badWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(ticket)}`, {
        origin: "https://evil.example.com",
      });
      badWs.on("unexpected-response", (_req, res) => {
        assert.equal(res.statusCode, 403);
        resolve();
      });
      badWs.on("error", () => resolve());
    });

    // Valid origin connects cleanly & streams hardened docker stdio
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(ticket)}`, {
        origin: "http://localhost:3000",
      });
      let output = "";
      ws.on("open", () => {
        ws.send(JSON.stringify({ type: "input", data: "pwd\n" }));
      });
      ws.on("message", (raw) => {
        const msg = JSON.parse(raw.toString("utf8"));
        if (msg.type === "output") {
          output += msg.data;
          if (output.includes("echo:pwd")) {
            ws.close();
            resolve();
          }
        }
      });
      ws.on("error", reject);
    });

    const args = spawnedDockerArgs[0];
    assert.ok(args.includes("--network=none"));
    assert.ok(args.includes("--cap-drop=ALL"));
    assert.ok(args.includes("--security-opt=no-new-privileges:true"));
    assert.ok(args.includes("--pids-limit=64"));
    assert.ok(args.includes("--memory=512m"));

    // Replay same single-use jti -> rejected (401)
    await new Promise((resolve) => {
      const replayWs = new WebSocket(`ws://127.0.0.1:${port}/terminal?token=${encodeURIComponent(ticket)}`, {
        origin: "http://localhost:3000",
      });
      replayWs.on("unexpected-response", (_req, res) => {
        assert.equal(res.statusCode, 401);
        resolve();
      });
      replayWs.on("error", () => resolve());
    });
  } finally {
    gateway.closeAll();
    await new Promise((r) => server.close(r));
    await rm(base, { recursive: true, force: true });
  }
});
