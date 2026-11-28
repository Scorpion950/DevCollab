import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { scrubSecrets } from "@devcollab/ai-core";
import type { WorkerConfig } from "./config.js";
import { verifyHs256Jwt } from "./jwt.js";
import type { WorkspaceFilesystemService } from "./workspace-fs.js";

export type DockerProbeFn = () => Promise<{ available: boolean; reason: string }>;
export type ContainerShellSpawner = (
  dockerArgs: string[],
) => ChildProcessWithoutNullStreams;

const MAX_OUTPUT_BYTES_PER_SECOND = 256 * 1024;
const MAX_ACTIVE_SESSIONS_PER_USER = 3;

export class WorkspaceTerminalGateway {
  private readonly wss = new WebSocketServer({ noServer: true });
  private readonly consumedJtis = new Map<string, number>();
  private readonly activeByUser = new Map<string, number>();

  constructor(
    private readonly config: WorkerConfig,
    private readonly fsService: WorkspaceFilesystemService,
    private readonly checkDocker: DockerProbeFn,
    private readonly spawnContainer: ContainerShellSpawner = (dockerArgs) =>
      spawn("docker", dockerArgs, { shell: false, windowsHide: true }),
    private readonly onSessionEvent?: (event: {
      workspaceId: string;
      userId: string;
      sessionId: string;
      type: "STARTED" | "ENDED" | "REJECTED";
      reason?: string;
      exitCode?: number | null;
    }) => void,
  ) {}

  private rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
      );
    } catch {
      // Ignore socket write errors on closing socket
    }
    socket.destroy();
  }

  private cleanupExpiredJtis(nowMs: number) {
    if (this.consumedJtis.size < 1000) return;
    for (const [jti, expMs] of this.consumedJtis.entries()) {
      if (expMs <= nowMs) this.consumedJtis.delete(jti);
    }
  }

  async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reqUrl = new URL(request.url ?? "/", "http://localhost");
    if (reqUrl.pathname !== "/terminal") {
      this.rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const origin = request.headers.origin?.replace(/\/$/, "");
    if (origin && !this.config.terminalAllowedOrigins.includes(origin)) {
      this.rejectUpgrade(socket, 403, "Forbidden Origin");
      return;
    }

    const secret = this.config.internalAuthSecret;
    if (!secret || secret.length < 32) {
      this.rejectUpgrade(socket, 503, "Terminal Authentication Misconfigured");
      return;
    }

    const token = reqUrl.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      this.rejectUpgrade(socket, 401, "Terminal Ticket Required");
      return;
    }

    let claims: ReturnType<typeof verifyHs256Jwt>;
    try {
      claims = verifyHs256Jwt(token, secret, {
        iss: "devcollab-api",
        aud: "devcollab-worker-terminal",
      });
    } catch {
      this.rejectUpgrade(socket, 401, "Invalid or Expired Terminal Ticket");
      return;
    }

    const workspaceId = typeof claims.workspaceId === "string" ? claims.workspaceId : "";
    const workspacePathKey =
      typeof claims.workspacePathKey === "string" ? claims.workspacePathKey : "";
    const userId = typeof claims.sub === "string" ? claims.sub : "";
    const sessionId = typeof claims.sessionId === "string" ? claims.sessionId : "";
    const jti = typeof claims.jti === "string" ? claims.jti : "";

    if (!workspaceId || !workspacePathKey || !userId || !sessionId || !jti) {
      this.rejectUpgrade(socket, 401, "Incomplete Terminal Ticket");
      return;
    }

    const nowMs = Date.now();
    this.cleanupExpiredJtis(nowMs);
    if (this.consumedJtis.has(jti)) {
      this.rejectUpgrade(socket, 401, "Terminal Ticket Already Used");
      return;
    }

    if (!this.config.terminalEnabled || !this.config.sandboxEnabled) {
      this.onSessionEvent?.({
        workspaceId,
        userId,
        sessionId,
        type: "REJECTED",
        reason: "Terminal sandbox disabled by server policy.",
      });
      this.rejectUpgrade(socket, 503, "Terminal Sandbox Disabled");
      return;
    }

    const dockerProbe = await this.checkDocker();
    if (!dockerProbe.available) {
      this.onSessionEvent?.({
        workspaceId,
        userId,
        sessionId,
        type: "REJECTED",
        reason: dockerProbe.reason,
      });
      this.rejectUpgrade(socket, 503, "Isolated Terminal Container Runtime Unavailable");
      return;
    }

    let realRepoDir: string;
    try {
      realRepoDir = await this.fsService.requireExistingRepoDir(workspacePathKey);
    } catch {
      this.rejectUpgrade(socket, 404, "Workspace Directory Not Ready");
      return;
    }

    const currentActive = this.activeByUser.get(userId) ?? 0;
    if (currentActive >= MAX_ACTIVE_SESSIONS_PER_USER) {
      this.rejectUpgrade(socket, 429, "Too Many Active Terminal Sessions");
      return;
    }

    this.consumedJtis.set(jti, (claims.exp ?? Math.floor(nowMs / 1000) + 120) * 1000);

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.attachContainerSession(ws, {
        workspaceId,
        userId,
        sessionId,
        realRepoDir,
      });
    });
  }

  buildHardenedTerminalDockerArgs(realRepoDir: string): string[] {
    return [
      "run",
      "-i",
      "--rm",
      "--network=none",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--pids-limit=64",
      "--memory=512m",
      "--cpus=1",
      "--user=1000:1000",
      "-e",
      "TERM=xterm-256color",
      "-e",
      "HOME=/tmp",
      "-e",
      "PS1=devcollab:/workspace$ ",
      "-v",
      `${realRepoDir}:/workspace:rw`,
      "-w",
      "/workspace",
      this.config.sandboxDockerImage,
      "sh",
    ];
  }

  private attachContainerSession(
    ws: WebSocket,
    ctx: { workspaceId: string; userId: string; sessionId: string; realRepoDir: string },
  ) {
    this.activeByUser.set(ctx.userId, (this.activeByUser.get(ctx.userId) ?? 0) + 1);
    this.onSessionEvent?.({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      type: "STARTED",
    });

    const dockerArgs = this.buildHardenedTerminalDockerArgs(ctx.realRepoDir);
    const child = this.spawnContainer(dockerArgs);

    let closed = false;
    let windowStart = Date.now();
    let bytesThisSecond = 0;

    let idleTimer = setTimeout(() => {
      sendServerNotice("\r\n[DevCollab terminal timed out due to inactivity]\r\n");
      cleanup(null, "Idle timeout reached.");
    }, this.config.terminalIdleMs);

    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        sendServerNotice("\r\n[DevCollab terminal timed out due to inactivity]\r\n");
        cleanup(null, "Idle timeout reached.");
      }, this.config.terminalIdleMs);
    };

    const sendServerNotice = (text: string) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "output", data: text }));
      }
    };

    const emitChunk = (chunk: Buffer) => {
      if (closed || ws.readyState !== ws.OPEN) return;
      const now = Date.now();
      if (now - windowStart >= 1000) {
        windowStart = now;
        bytesThisSecond = 0;
      }
      bytesThisSecond += chunk.byteLength;
      if (bytesThisSecond > MAX_OUTPUT_BYTES_PER_SECOND) {
        return;
      }
      const clean = scrubSecrets(chunk.toString("utf8"), [
        this.config.internalAuthSecret,
        this.config.ai?.apiKey,
        this.config.github?.privateKey,
      ]);
      ws.send(JSON.stringify({ type: "output", data: clean }));
    };

    const cleanup = (exitCode: number | null, reason?: string) => {
      if (closed) return;
      closed = true;
      clearTimeout(idleTimer);
      const count = this.activeByUser.get(ctx.userId) ?? 1;
      if (count <= 1) this.activeByUser.delete(ctx.userId);
      else this.activeByUser.set(ctx.userId, count - 1);

      try {
        if (!child.killed) child.kill("SIGKILL");
      } catch {
        // Ignore child kill error
      }
      this.onSessionEvent?.({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        type: "ENDED",
        exitCode,
        reason,
      });
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: "exit", exitCode }));
        ws.close(1000, reason ?? "Session ended");
      }
    };

    sendServerNotice(
      `\r\nConnected to isolated workspace container (${this.config.sandboxDockerImage}, network disabled)\r\n/workspace $ `,
    );

    child.stdout.on("data", emitChunk);
    child.stderr.on("data", emitChunk);
    child.on("close", (code) => cleanup(code));
    child.on("error", (err) => {
      sendServerNotice(`\r\n[Container error: ${err.message}]\r\n`);
      cleanup(1, err.message);
    });

    ws.on("message", (raw) => {
      if (closed) return;
      resetIdle();
      const text = typeof raw === "string" ? raw : raw.toString("utf8");
      if (text.length > 8192) return;
      try {
        const msg = JSON.parse(text) as { type?: string; data?: string };
        if (msg.type === "input" && typeof msg.data === "string") {
          child.stdin.write(msg.data.slice(0, 4096));
        }
      } catch {
        // Ignore invalid non-JSON control messages
      }
    });

    ws.on("close", () => cleanup(null, "Client disconnected"));
    ws.on("error", () => cleanup(null, "WebSocket error"));
  }

  closeAll() {
    this.wss.close();
  }
}
