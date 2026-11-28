import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { promisify } from "node:util";
import type { PrismaClient } from "@devcollab/database";
import { scrubSecrets } from "@devcollab/ai-core";
import type { WorkerConfig } from "./config.js";
import { CollabGateway } from "./collab-gateway.js";
import { CollabStore } from "./collab-store.js";
import { verifyHs256Jwt } from "./jwt.js";
import { WorkspaceTerminalGateway, type DockerProbeFn } from "./terminal-gateway.js";
import { WorkspaceFilesystemService, WorkspaceFsError } from "./workspace-fs.js";

const execFileAsync = promisify(execFile);

const DEFAULT_DOCKER_PROBE: DockerProbeFn = async () => {
  try {
    const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      timeout: 2500,
      windowsHide: true,
    });
    return {
      available: true,
      reason: `Docker sandbox runtime ready (engine ${stdout.trim() || "detected"}).`,
    };
  } catch {
    return {
      available: false,
      reason:
        "Docker sandbox runtime is not available on this worker host; isolated container terminal is disabled.",
    };
  }
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readJsonBody(req: IncomingMessage, maxBytes = 42 * 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      throw new WorkspaceFsError("Request payload exceeds maximum allowed size.", 413, "PAYLOAD_TOO_LARGE");
    }
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks, total).toString("utf8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Expected JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new WorkspaceFsError("Malformed JSON request body.", 400, "INVALID_JSON");
  }
}

export interface WorkerRuntimeServer {
  server: Server;
  fsService: WorkspaceFilesystemService;
  terminalGateway: WorkspaceTerminalGateway;
  collabStore: CollabStore;
  collabGateway: CollabGateway;
  listen(): Promise<number>;
  close(): Promise<void>;
}

export function createWorkerHttpServer(deps: {
  config: WorkerConfig;
  prisma?: PrismaClient;
  checkDocker?: DockerProbeFn;
}): WorkerRuntimeServer {
  const fsService = new WorkspaceFilesystemService(
    deps.config.workspaceRootDir,
    deps.config.workspaceSnapshotDir,
    deps.config.maxFileBytes,
  );
  const checkDocker = deps.checkDocker ?? DEFAULT_DOCKER_PROBE;
  const collabStore = new CollabStore(deps.config.workspaceSnapshotDir, fsService, deps.prisma);
  const collabGateway = new CollabGateway(deps.config, collabStore, deps.prisma);

  const terminalGateway = new WorkspaceTerminalGateway(
    deps.config,
    fsService,
    checkDocker,
    undefined,
    (ev) => {
      if (!deps.prisma) return;
      if (ev.type === "ENDED") {
        void deps.prisma.workspaceTerminalSession
          .updateMany({
            where: { id: ev.sessionId },
            data: {
              status: "ENDED",
              exitCode: ev.exitCode ?? null,
              reason: ev.reason ?? null,
              endedAt: new Date(),
            },
          })
          .catch(() => {});
      }
    },
  );

  function authorizeServiceRequest(req: IncomingMessage) {
    const secret = deps.config.internalAuthSecret;
    if (!secret || secret.length < 32) {
      throw new WorkspaceFsError("Worker INTERNAL_AUTH_SECRET is not configured.", 503, "UNCONFIGURED");
    }
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
      throw new WorkspaceFsError("Missing service authorization.", 401, "UNAUTHORIZED");
    }
    try {
      verifyHs256Jwt(token, secret, { iss: "devcollab-api", aud: "devcollab-worker" });
    } catch {
      throw new WorkspaceFsError("Invalid service assertion.", 401, "UNAUTHORIZED");
    }
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const method = (req.method ?? "GET").toUpperCase();

      if (method === "GET" && url.pathname === "/health") {
        const [gitAvailable, docker] = await Promise.all([
          fsService.checkGitAvailable(),
          checkDocker(),
        ]);
        const sandboxAvailable = deps.config.sandboxEnabled && docker.available;
        const terminalAvailable =
          deps.config.terminalEnabled && deps.config.sandboxEnabled && docker.available;
        const terminalReason = !deps.config.terminalEnabled
          ? "Terminal disabled by WORKSPACE_TERMINAL_ENABLED=false."
          : !deps.config.sandboxEnabled
            ? "Sandbox disabled by SANDBOX_ENABLED=false; host shell fallback is strictly disabled."
            : docker.available
              ? `Hardened Docker terminal runtime ready (${deps.config.sandboxDockerImage}).`
              : docker.reason;

        sendJson(res, 200, {
          ok: true,
          workerId: deps.config.workerId,
          gitAvailable,
          sandboxAvailable,
          sandboxReason: docker.reason,
          terminalAvailable,
          terminalReason,
          storageMode: deps.config.workspaceStorageMode,
          maxFileBytes: deps.config.maxFileBytes,
        });
        return;
      }

      authorizeServiceRequest(req);

      if (method === "POST" && url.pathname === "/workspaces/init") {
        const body = await readJsonBody(req);
        const pathKey = String(body.pathKey ?? "");
        const tarballBase64 = String(body.tarballBase64 ?? "");
        const repoFullName = String(body.repoFullName ?? "");
        const baseBranch = String(body.baseBranch ?? "main");
        const baseCommitSha = String(body.baseCommitSha ?? "head");
        const tarballBuffer = Buffer.from(tarballBase64, "base64");
        const result = await fsService.initializeFromTarball({
          pathKey,
          tarballBuffer,
          repoFullName,
          baseBranch,
          baseCommitSha,
        });
        sendJson(res, 200, result);
        return;
      }

      const collabMatch = /^\/collab\/sessions\/([^/]+)\/(flush|revoke|role|close)$/.exec(url.pathname);
      if (method === "POST" && collabMatch) {
        const sessionId = decodeURIComponent(collabMatch[1] ?? "");
        const action = collabMatch[2];
        const body = await readJsonBody(req);
        if (action === "flush") {
          const pathKey = String(body.pathKey ?? "");
          const flushed = pathKey ? await collabStore.flushAllForWorkspace(pathKey, sessionId) : 0;
          sendJson(res, 200, { flushed });
          return;
        }
        if (action === "revoke") {
          const userId = String(body.userId ?? "");
          const reason = typeof body.reason === "string" ? body.reason : "Your session access was revoked.";
          if (userId) collabGateway.invalidateParticipant(sessionId, userId, reason);
          sendJson(res, 200, { revoked: true });
          return;
        }
        if (action === "role") {
          const userId = String(body.userId ?? "");
          const role = body.role === "OWNER" || body.role === "EDITOR" || body.role === "VIEWER" ? body.role : "VIEWER";
          if (userId) collabGateway.updateParticipantRole(sessionId, userId, role);
          sendJson(res, 200, { updated: true });
          return;
        }
        if (action === "close") {
          const reason = typeof body.reason === "string" ? body.reason : "Collaborative session closed.";
          await collabGateway.closeSession(sessionId, reason);
          sendJson(res, 200, { closed: true });
          return;
        }
      }

      const wsMatch = /^\/workspaces\/([^/]+)(\/.*)?$/.exec(url.pathname);
      if (!wsMatch) {
        sendJson(res, 404, { message: "Not found" });
        return;
      }

      const pathKey = decodeURIComponent(wsMatch[1] ?? "");
      const subPath = wsMatch[2] ?? "";

      if (method === "GET" && subPath === "/exists") {
        sendJson(res, 200, { exists: await fsService.exists(pathKey) });
        return;
      }

      if (method === "DELETE" && (subPath === "" || subPath === "/")) {
        await fsService.deleteWorkspaceDir(pathKey);
        sendJson(res, 200, { deleted: true });
        return;
      }

      if (method === "GET" && subPath === "/tree") {
        const entries = await fsService.listTree(pathKey);
        sendJson(res, 200, { entries });
        return;
      }

      if (method === "GET" && subPath === "/file") {
        await collabStore.flushAllForWorkspace(pathKey);
        const relPath = url.searchParams.get("path") ?? "";
        const file = await fsService.readFile(pathKey, relPath);
        sendJson(res, 200, file);
        return;
      }

      if (method === "PUT" && subPath === "/file") {
        const body = await readJsonBody(req);
        const saved = await fsService.writeFile({
          pathKey,
          path: String(body.path ?? ""),
          content: typeof body.content === "string" ? body.content : "",
          expectedVersionHash:
            typeof body.expectedVersionHash === "string" ? body.expectedVersionHash : null,
        });
        await collabStore.reconcileWorkspaceFilesFromDisk(pathKey, [saved.path]);
        sendJson(res, 200, saved);
        return;
      }

      if (method === "POST" && subPath === "/create-file") {
        const body = await readJsonBody(req);
        const created = await fsService.createFile({
          pathKey,
          path: String(body.path ?? ""),
          content: typeof body.content === "string" ? body.content : "",
        });
        collabStore.notifyFileCreatedForWorkspace(pathKey, created.path);
        sendJson(res, 201, created);
        return;
      }

      if (method === "POST" && subPath === "/create-folder") {
        const body = await readJsonBody(req);
        const created = await fsService.createFolder({
          pathKey,
          path: String(body.path ?? ""),
        });
        sendJson(res, 201, created);
        return;
      }

      if (method === "POST" && subPath === "/rename") {
        const body = await readJsonBody(req);
        await collabStore.flushAllForWorkspace(pathKey);
        const moved = await fsService.renameEntry({
          pathKey,
          oldPath: String(body.oldPath ?? ""),
          newPath: String(body.newPath ?? ""),
        });
        await collabStore.handleFileRenameForWorkspace(pathKey, moved.oldPath, moved.newPath);
        sendJson(res, 200, moved);
        return;
      }

      if (method === "POST" && subPath === "/delete-entry") {
        const body = await readJsonBody(req);
        const removed = await fsService.deleteEntry({
          pathKey,
          path: String(body.path ?? ""),
          confirmNonEmpty: body.confirmNonEmpty === true,
        });
        await collabStore.markFileDeletedForWorkspace(pathKey, removed.path);
        sendJson(res, 200, removed);
        return;
      }

      if (method === "GET" && subPath === "/search") {
        await collabStore.flushAllForWorkspace(pathKey);
        const q = url.searchParams.get("q") ?? "";
        const mode = url.searchParams.get("mode") === "text" ? "text" : "files";
        const matches = await fsService.searchWorkspace(pathKey, q, mode);
        sendJson(res, 200, { matches });
        return;
      }

      if (method === "GET" && subPath === "/git/status") {
        await collabStore.flushAllForWorkspace(pathKey);
        const status = await fsService.getGitStatus(pathKey);
        sendJson(res, 200, status);
        return;
      }

      if (method === "GET" && subPath === "/git/diff") {
        await collabStore.flushAllForWorkspace(pathKey);
        const scopeRaw = url.searchParams.get("scope");
        const scope =
          scopeRaw === "staged" || scopeRaw === "commit" ? scopeRaw : "unstaged";
        const relPath = url.searchParams.get("path") ?? undefined;
        const sha = url.searchParams.get("sha") ?? undefined;
        const diff = await fsService.getGitDiff(pathKey, scope, relPath, sha);
        sendJson(res, 200, diff);
        return;
      }

      if (method === "POST" && subPath === "/git/stage") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const paths = Array.isArray(body.paths) ? body.paths.map(String) : undefined;
        const status = await fsService.stageFiles(pathKey, paths);
        sendJson(res, 200, status);
        return;
      }

      if (method === "POST" && subPath === "/git/unstage") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const paths = Array.isArray(body.paths) ? body.paths.map(String) : undefined;
        const status = await fsService.unstageFiles(pathKey, paths);
        sendJson(res, 200, status);
        return;
      }

      if (method === "POST" && subPath === "/git/commit") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const result = await fsService.commitChanges(pathKey, String(body.message ?? ""));
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && subPath === "/git/branch") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const status = await fsService.switchBranch(
          pathKey,
          String(body.branch ?? ""),
          body.createNew === true,
        );
        await collabStore.reconcileWorkspaceFilesFromDisk(pathKey);
        sendJson(res, 200, status);
        return;
      }

      if (method === "POST" && subPath === "/apply-patch") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const expectedBaseHashes =
          body.expectedBaseHashes &&
          typeof body.expectedBaseHashes === "object" &&
          !Array.isArray(body.expectedBaseHashes)
            ? (body.expectedBaseHashes as Record<string, string | null>)
            : undefined;
        const result = await fsService.applyAiPatch(pathKey, String(body.rawPatch ?? ""), {
          expectedBaseHashes,
          allowDirtyTargetFiles: body.allowDirtyTargetFiles === true,
        });
        await collabStore.reconcileWorkspaceFilesFromDisk(pathKey, result.appliedPaths);
        for (const deleted of result.deletedPaths) {
          await collabStore.markFileDeletedForWorkspace(pathKey, deleted);
        }
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && subPath === "/snapshot") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const result = await fsService.createRecoverySnapshot(
          pathKey,
          String(body.workspaceId ?? ""),
          String(body.snapshotId ?? ""),
        );
        sendJson(res, 200, result);
        return;
      }

      if (method === "POST" && subPath === "/restore-snapshot") {
        await collabStore.flushAllForWorkspace(pathKey);
        const body = await readJsonBody(req);
        const result = await fsService.restoreRecoverySnapshot({
          pathKey,
          storageKey: String(body.storageKey ?? ""),
          expectedChecksum: String(body.expectedChecksum ?? ""),
        });
        await collabStore.reconcileWorkspaceFilesFromDisk(pathKey);
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { message: "Workspace runtime endpoint not found." });
    } catch (error) {
      if (error instanceof WorkspaceFsError) {
        sendJson(res, error.statusCode, {
          message: error.message,
          code: error.code,
          ...(error.conflictFiles ? { conflictFiles: error.conflictFiles } : {}),
        });
        return;
      }
      const message = scrubSecrets(
        error instanceof Error ? error.message : String(error),
        [deps.config.internalAuthSecret, deps.config.ai?.apiKey, deps.config.github?.privateKey],
      );
      sendJson(res, 500, { message });
    }
  });

  server.on("upgrade", (request, socket, head) => {
    const reqUrl = new URL(request.url ?? "/", "http://localhost");
    if (reqUrl.pathname === "/collab") {
      void collabGateway.handleUpgrade(request, socket, head);
      return;
    }
    void terminalGateway.handleUpgrade(request, socket, head);
  });

  return {
    server,
    fsService,
    terminalGateway,
    collabStore,
    collabGateway,
    listen: () =>
      new Promise<number>((resolve, reject) => {
        server.once("error", reject);
        server.listen(deps.config.workerHttpPort, deps.config.workerBindHost, () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : deps.config.workerHttpPort);
        });
      }),
    close: () =>
      new Promise<void>((resolve) => {
        collabGateway.closeAll();
        terminalGateway.closeAll();
        void collabStore.closeAllRooms().finally(() => {
          server.close(() => resolve());
          server.closeAllConnections?.();
        });
      }),
  };
}
