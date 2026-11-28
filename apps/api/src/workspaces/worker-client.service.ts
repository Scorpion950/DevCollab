import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignJWT } from "jose";
import type {
  WorkspaceFileContentDto,
  WorkspaceGitDiffDto,
  WorkspaceGitStatusDto,
  WorkspaceRuntimeCapabilitiesDto,
  WorkspaceSearchMatchDto,
  WorkspaceStorageMode,
  WorkspaceTreeEntryDto,
} from "@devcollab/shared";
import { validateEnvironment, type WorkerClientConfiguration } from "../config/environment";

export interface WorkerHttpTransport {
  request(
    url: string,
    init: { method: string; headers: Record<string, string>; body?: string; timeoutMs: number },
  ): Promise<{ status: number; text: string }>;
}

const DEFAULT_WORKER_TRANSPORT: WorkerHttpTransport = {
  async request(url, init) {
    const res = await fetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      redirect: "error",
      signal: AbortSignal.timeout(init.timeoutMs),
    });
    const text = await res.text();
    return { status: res.status, text };
  },
};

export function storageWarningForMode(mode: WorkspaceStorageMode): string | null {
  if (mode === "DURABLE") return null;
  if (mode === "LOCAL_VOLUME") {
    return "Workspace storage runs on a local worker disk volume. Stop/suspend creates snapshots cleanly, but node restarts or volume replacements can lose un-snapshotted state.";
  }
  return "Ephemeral worker storage active: workspace files outside snapshots and local commits are temporary and may not persist across worker restarts or container recycles.";
}

@Injectable()
export class WorkerClientService {
  private transport: WorkerHttpTransport = DEFAULT_WORKER_TRANSPORT;
  private secretCache: { raw: string; key: Uint8Array } | null = null;

  constructor(@Optional() @Inject(ConfigService) private readonly config?: ConfigService) {}

  setTransportForTesting(transport: WorkerHttpTransport) {
    this.transport = transport;
  }

  getWorkerConfig(): WorkerClientConfiguration {
    const cfg = this.config?.get<WorkerClientConfiguration>("worker");
    if (cfg) return cfg;
    return validateEnvironment(process.env).worker;
  }

  private getSigningKey(): Uint8Array {
    const raw =
      this.config?.get<string>("INTERNAL_AUTH_SECRET") ??
      process.env.INTERNAL_AUTH_SECRET ??
      "";
    if (!raw || raw.length < 32) {
      throw new ServiceUnavailableException(
        "INTERNAL_AUTH_SECRET must be set (>= 32 chars) to sign worker assertions.",
      );
    }
    if (!this.secretCache || this.secretCache.raw !== raw) {
      this.secretCache = { raw, key: new TextEncoder().encode(raw) };
    }
    return this.secretCache.key;
  }

  private async signWorkerServiceAssertion(): Promise<string> {
    const key = this.getSigningKey();
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("devcollab-api")
      .setAudience("devcollab-worker")
      .setIssuedAt()
      .setExpirationTime("30s")
      .sign(key);
  }

  async signTerminalTicket(claims: {
    userId: string;
    orgId: string;
    projectId: string;
    workspaceId: string;
    workspacePathKey: string;
    sessionId: string;
  }): Promise<{ token: string; expiresAt: string; wsUrl: string }> {
    const key = this.getSigningKey();
    const expiresAtDate = new Date(Date.now() + 60_000);
    const token = await new SignJWT({
      orgId: claims.orgId,
      projectId: claims.projectId,
      workspaceId: claims.workspaceId,
      workspacePathKey: claims.workspacePathKey,
      sessionId: claims.sessionId,
      jti: randomUUID(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("devcollab-api")
      .setAudience("devcollab-worker-terminal")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("60s")
      .sign(key);

    return {
      token,
      expiresAt: expiresAtDate.toISOString(),
      wsUrl: this.getWorkerConfig().terminalPublicWsUrl,
    };
  }

  async signCollabTicket(claims: {
    userId: string;
    orgId: string;
    projectId: string;
    sessionId: string;
    workspaceId: string;
    workspacePathKey: string;
    role: string;
    colorHex: string;
    displayName: string;
  }): Promise<{ token: string; expiresAt: string; wsUrl: string }> {
    const key = this.getSigningKey();
    const expiresAtDate = new Date(Date.now() + 120_000);
    const token = await new SignJWT({
      orgId: claims.orgId,
      projectId: claims.projectId,
      sessionId: claims.sessionId,
      workspaceId: claims.workspaceId,
      pathKey: claims.workspacePathKey,
      role: claims.role,
      colorHex: claims.colorHex,
      displayName: claims.displayName,
      jti: randomUUID(),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("devcollab-api")
      .setAudience("devcollab-worker-collab")
      .setSubject(claims.userId)
      .setIssuedAt()
      .setExpirationTime("120s")
      .sign(key);

    const terminalUrl = this.getWorkerConfig().terminalPublicWsUrl;
    const collabWsUrl = terminalUrl.endsWith("/terminal")
      ? `${terminalUrl.slice(0, -"/terminal".length)}/collab`
      : `${terminalUrl.replace(/\/$/, "")}/collab`;

    return {
      token,
      expiresAt: expiresAtDate.toISOString(),
      wsUrl: collabWsUrl,
    };
  }

  private async callWorker<T>(
    path: string,
    options: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown; timeoutMs?: number } = {},
  ): Promise<T> {
    const cfg = this.getWorkerConfig();
    const token = await this.signWorkerServiceAssertion();
    const method = options.method ?? "GET";
    const url = `${cfg.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

    let res: { status: number; text: string };
    try {
      res = await this.transport.request(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        timeoutMs: options.timeoutMs ?? cfg.requestTimeoutMs,
      });
    } catch {
      throw new ServiceUnavailableException(
        "Workspace execution worker is offline or unreachable (start with `pnpm dev:worker`).",
      );
    }

    let parsed: Record<string, unknown> | null = null;
    if (res.text) {
      try {
        parsed = JSON.parse(res.text) as Record<string, unknown>;
      } catch {
        parsed = null;
      }
    }

    if (res.status >= 200 && res.status < 300) {
      return (parsed ?? {}) as T;
    }

    const msg =
      typeof parsed?.message === "string" && parsed.message.trim()
        ? parsed.message
        : `Workspace worker failed with status ${res.status}.`;

    if (res.status === 400) throw new BadRequestException(msg);
    if (res.status === 403) throw new ForbiddenException(msg);
    if (res.status === 404) throw new NotFoundException(msg);
    if (res.status === 409) throw new ConflictException(parsed ?? { message: msg });
    if (res.status === 413) throw new HttpException(msg, HttpStatus.PAYLOAD_TOO_LARGE);
    if (res.status === 503) throw new ServiceUnavailableException(msg);
    throw new ServiceUnavailableException(msg);
  }

  async getRuntimeCapabilities(): Promise<WorkspaceRuntimeCapabilitiesDto> {
    const cfg = this.getWorkerConfig();
    const hasSecret =
      Boolean(
        this.config?.get<string>("INTERNAL_AUTH_SECRET") ?? process.env.INTERNAL_AUTH_SECRET,
      );

    try {
      const res = await this.transport.request(`${cfg.baseUrl}/health`, {
        method: "GET",
        headers: { Accept: "application/json" },
        timeoutMs: 2500,
      });
      if (res.status !== 200) {
        return {
          workerConfigured: hasSecret,
          workerReachable: false,
          workerReason: `Workspace worker health endpoint returned status ${res.status}.`,
          gitAvailable: false,
          sandboxAvailable: false,
          sandboxReason: "Worker unreachable.",
          terminalAvailable: false,
          terminalReason: "Workspace execution worker is offline.",
          storageMode: "EPHEMERAL",
          storageWarning: storageWarningForMode("EPHEMERAL"),
          maxFileBytes: 524_288,
        };
      }
      const data = JSON.parse(res.text) as {
        workerId?: string;
        gitAvailable?: boolean;
        sandboxAvailable?: boolean;
        sandboxReason?: string;
        terminalAvailable?: boolean;
        terminalReason?: string;
        storageMode?: WorkspaceStorageMode;
        maxFileBytes?: number;
      };
      const storageMode: WorkspaceStorageMode =
        data.storageMode === "DURABLE" || data.storageMode === "LOCAL_VOLUME"
          ? data.storageMode
          : "EPHEMERAL";
      return {
        workerConfigured: hasSecret,
        workerReachable: true,
        workerReason: `Connected to worker ${data.workerId ?? "runtime"}.`,
        gitAvailable: Boolean(data.gitAvailable),
        sandboxAvailable: Boolean(data.sandboxAvailable),
        sandboxReason: data.sandboxReason ?? "Sandbox status unavailable.",
        terminalAvailable: Boolean(data.terminalAvailable),
        terminalReason: data.terminalReason ?? "Terminal unavailable.",
        storageMode,
        storageWarning: storageWarningForMode(storageMode),
        maxFileBytes: data.maxFileBytes ?? 524_288,
      };
    } catch {
      return {
        workerConfigured: hasSecret,
        workerReachable: false,
        workerReason:
          "Workspace execution worker is offline (`pnpm dev:worker`). Filesystem, Git, and terminal controls stay disabled until the worker is running.",
        gitAvailable: false,
        sandboxAvailable: false,
        sandboxReason: "Docker sandbox runtime unavailable while worker is offline.",
        terminalAvailable: false,
        terminalReason: "Isolated terminal requires a running workspace worker with container sandbox.",
        storageMode: "EPHEMERAL",
        storageWarning: storageWarningForMode("EPHEMERAL"),
        maxFileBytes: 524_288,
      };
    }
  }

  initWorkspace(input: {
    pathKey: string;
    tarballBuffer: Buffer;
    repoFullName: string;
    baseBranch: string;
    baseCommitSha: string;
  }) {
    return this.callWorker<{ fileCount: number; totalBytes: number; headSha: string }>(
      "/workspaces/init",
      {
        method: "POST",
        body: {
          pathKey: input.pathKey,
          tarballBase64: input.tarballBuffer.toString("base64"),
          repoFullName: input.repoFullName,
          baseBranch: input.baseBranch,
          baseCommitSha: input.baseCommitSha,
        },
        timeoutMs: 60_000,
      },
    );
  }

  checkExists(pathKey: string) {
    return this.callWorker<{ exists: boolean }>(`/workspaces/${encodeURIComponent(pathKey)}/exists`);
  }

  deleteWorkspace(pathKey: string) {
    return this.callWorker<{ deleted: boolean }>(`/workspaces/${encodeURIComponent(pathKey)}`, {
      method: "DELETE",
    });
  }

  listTree(pathKey: string) {
    return this.callWorker<{ entries: WorkspaceTreeEntryDto[] }>(
      `/workspaces/${encodeURIComponent(pathKey)}/tree`,
    );
  }

  readFile(pathKey: string, relPath: string) {
    return this.callWorker<WorkspaceFileContentDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/file?path=${encodeURIComponent(relPath)}`,
    );
  }

  writeFile(
    pathKey: string,
    body: { path: string; content: string; expectedVersionHash?: string | null },
  ) {
    return this.callWorker<{ path: string; versionHash: string; size: number }>(
      `/workspaces/${encodeURIComponent(pathKey)}/file`,
      { method: "PUT", body },
    );
  }

  createFile(pathKey: string, body: { path: string; content?: string }) {
    return this.callWorker<WorkspaceFileContentDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/create-file`,
      { method: "POST", body },
    );
  }

  createFolder(pathKey: string, body: { path: string }) {
    return this.callWorker<{ path: string }>(
      `/workspaces/${encodeURIComponent(pathKey)}/create-folder`,
      { method: "POST", body },
    );
  }

  renameEntry(pathKey: string, body: { oldPath: string; newPath: string }) {
    return this.callWorker<{ oldPath: string; newPath: string }>(
      `/workspaces/${encodeURIComponent(pathKey)}/rename`,
      { method: "POST", body },
    );
  }

  deleteEntry(pathKey: string, body: { path: string; confirmNonEmpty?: boolean }) {
    return this.callWorker<{ path: string; deletedDirectory: boolean }>(
      `/workspaces/${encodeURIComponent(pathKey)}/delete-entry`,
      { method: "POST", body },
    );
  }

  search(pathKey: string, query: string, mode: "files" | "text") {
    return this.callWorker<{ matches: WorkspaceSearchMatchDto[] }>(
      `/workspaces/${encodeURIComponent(pathKey)}/search?q=${encodeURIComponent(query)}&mode=${encodeURIComponent(mode)}`,
    );
  }

  getGitStatus(pathKey: string) {
    return this.callWorker<WorkspaceGitStatusDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/git/status`,
    );
  }

  getGitDiff(
    pathKey: string,
    scope: "unstaged" | "staged" | "commit",
    relPath?: string,
    sha?: string,
  ) {
    const params = new URLSearchParams({ scope });
    if (relPath) params.set("path", relPath);
    if (sha) params.set("sha", sha);
    return this.callWorker<WorkspaceGitDiffDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/git/diff?${params.toString()}`,
    );
  }

  stageFiles(pathKey: string, paths?: string[]) {
    return this.callWorker<WorkspaceGitStatusDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/git/stage`,
      { method: "POST", body: { paths } },
    );
  }

  unstageFiles(pathKey: string, paths?: string[]) {
    return this.callWorker<WorkspaceGitStatusDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/git/unstage`,
      { method: "POST", body: { paths } },
    );
  }

  commitChanges(pathKey: string, message: string) {
    return this.callWorker<{
      sha: string;
      shortSha: string;
      message: string;
      status: WorkspaceGitStatusDto;
    }>(`/workspaces/${encodeURIComponent(pathKey)}/git/commit`, {
      method: "POST",
      body: { message },
    });
  }

  switchBranch(pathKey: string, branch: string, createNew: boolean) {
    return this.callWorker<WorkspaceGitStatusDto>(
      `/workspaces/${encodeURIComponent(pathKey)}/git/branch`,
      { method: "POST", body: { branch, createNew } },
    );
  }

  applyPatch(
    pathKey: string,
    rawPatch: string,
    opts?: { expectedBaseHashes?: Record<string, string | null>; allowDirtyTargetFiles?: boolean },
  ) {
    return this.callWorker<{
      filesChanged: number;
      appliedPaths: string[];
      deletedPaths: string[];
      status: WorkspaceGitStatusDto;
    }>(
      `/workspaces/${encodeURIComponent(pathKey)}/apply-patch`,
      {
        method: "POST",
        body: {
          rawPatch,
          ...(opts?.expectedBaseHashes ? { expectedBaseHashes: opts.expectedBaseHashes } : {}),
          ...(opts?.allowDirtyTargetFiles ? { allowDirtyTargetFiles: true } : {}),
        },
      },
    );
  }

  flushCollabSession(sessionId: string, pathKey: string) {
    return this.callWorker<{ flushed: number }>(
      `/collab/sessions/${encodeURIComponent(sessionId)}/flush`,
      { method: "POST", body: { pathKey } },
    );
  }

  revokeCollabParticipant(sessionId: string, userId: string, reason: string) {
    return this.callWorker<{ revoked: boolean }>(
      `/collab/sessions/${encodeURIComponent(sessionId)}/revoke`,
      { method: "POST", body: { userId, reason } },
    );
  }

  updateCollabParticipantRole(sessionId: string, userId: string, role: "OWNER" | "EDITOR" | "VIEWER") {
    return this.callWorker<{ updated: boolean }>(
      `/collab/sessions/${encodeURIComponent(sessionId)}/role`,
      { method: "POST", body: { userId, role } },
    );
  }

  closeCollabSession(sessionId: string, reason: string) {
    return this.callWorker<{ closed: boolean }>(
      `/collab/sessions/${encodeURIComponent(sessionId)}/close`,
      { method: "POST", body: { reason } },
    );
  }

  createSnapshot(pathKey: string, workspaceId: string, snapshotId: string) {
    return this.callWorker<{
      storageKey: string;
      sizeBytes: number;
      checksumSha256: string;
      trackedFileCount: number;
      untrackedFileCount: number;
    }>(`/workspaces/${encodeURIComponent(pathKey)}/snapshot`, {
      method: "POST",
      body: { workspaceId, snapshotId },
    });
  }

  restoreSnapshot(pathKey: string, storageKey: string, expectedChecksum: string) {
    return this.callWorker<{ restoredFiles: number }>(
      `/workspaces/${encodeURIComponent(pathKey)}/restore-snapshot`,
      { method: "POST", body: { storageKey, expectedChecksum } },
    );
  }
}
