import { hostname } from "node:os";
import path from "node:path";
import type { AiProviderKind } from "@devcollab/ai-core";
import type { WorkspaceStorageMode } from "@devcollab/shared";

export interface WorkerConfig {
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  maxContextFiles: number;
  maxContextBytes: number;
  sandboxEnabled: boolean;
  sandboxDockerImage: string;
  sandboxTimeoutMs: number;
  workerHttpPort: number;
  workerBindHost: string;
  workerPublicWsUrl: string;
  internalAuthSecret?: string;
  workspaceRootDir: string;
  workspaceSnapshotDir: string;
  workspaceStorageMode: WorkspaceStorageMode;
  terminalEnabled: boolean;
  terminalAllowedOrigins: string[];
  terminalIdleMs: number;
  maxFileBytes: number;
  github?: {
    appId: string;
    privateKey: string;
    apiBaseUrl: string;
  };
  ai?: {
    provider: AiProviderKind;
    model: string;
    apiKey: string;
    apiBaseUrl?: string;
    timeoutMs: number;
    priceInputPer1m: number;
    priceOutputPer1m: number;
  };
}

function normalizePem(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }
  cleaned = cleaned.replace(/\\n/g, "\n").trim();
  return cleaned || undefined;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const providerRaw = env.AI_PROVIDER?.trim().toLowerCase();
  const provider =
    providerRaw === "openai" || providerRaw === "anthropic" || providerRaw === "openai-compatible"
      ? providerRaw
      : undefined;
  const model = env.AI_MODEL?.trim() || undefined;
  const apiKey = env.AI_API_KEY?.trim() || undefined;
  const apiBaseUrl = env.AI_API_BASE_URL?.trim().replace(/\/$/, "") || undefined;
  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? 45_000);
  const priceInputPer1m = Number(env.AI_PRICE_INPUT_PER_1M ?? 0);
  const priceOutputPer1m = Number(env.AI_PRICE_OUTPUT_PER_1M ?? 0);

  const appId = env.GITHUB_APP_ID?.trim() || undefined;
  const privateKey = normalizePem(env.GITHUB_APP_PRIVATE_KEY);
  const githubApiBaseUrl = (env.GITHUB_API_BASE_URL?.trim() || "https://api.github.com").replace(
    /\/$/,
    "",
  );

  const pollIntervalMs = Number(env.WORKER_POLL_INTERVAL_MS ?? 2500);
  const leaseDurationMs = Number(env.WORKER_LEASE_DURATION_MS ?? 180_000);
  const maxContextFiles = Number(env.AI_MAX_CONTEXT_FILES ?? 24);
  const maxContextBytes = Number(env.AI_MAX_CONTEXT_BYTES ?? 96_000);
  const sandboxEnabled = String(env.SANDBOX_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const sandboxDockerImage = env.SANDBOX_DOCKER_IMAGE?.trim() || "node:24-alpine";
  const sandboxTimeoutMs = Number(env.SANDBOX_TIMEOUT_MS ?? 60_000);

  const workerHttpPort = Number(env.WORKER_PORT ?? 4100);
  const workerBindHost = env.WORKER_BIND_HOST?.trim() || "127.0.0.1";
  const workerPublicWsUrl = (
    env.WORKER_TERMINAL_PUBLIC_URL?.trim() || `ws://localhost:${Number.isFinite(workerHttpPort) ? workerHttpPort : 4100}/terminal`
  ).replace(/\/$/, "");
  const workspaceRootDir = path.resolve(
    env.WORKSPACE_STORAGE_DIR?.trim() || path.resolve(process.cwd(), "../../.devcollab-workspaces"),
  );
  const workspaceSnapshotDir = path.resolve(
    env.WORKSPACE_SNAPSHOT_DIR?.trim() || path.join(workspaceRootDir, "_snapshots"),
  );
  const storageRaw = env.WORKSPACE_STORAGE_MODE?.trim().toLowerCase();
  const workspaceStorageMode: WorkspaceStorageMode =
    storageRaw === "durable"
      ? "DURABLE"
      : storageRaw === "local_volume"
        ? "LOCAL_VOLUME"
        : "EPHEMERAL";

  const terminalEnabled =
    String(env.WORKSPACE_TERMINAL_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const corsRaw = env.CORS_ORIGINS?.trim() || "http://localhost:3000";
  const terminalAllowedOrigins = corsRaw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const terminalIdleMs = Number(env.WORKSPACE_TERMINAL_IDLE_MS ?? 600_000);
  const maxFileBytes = Number(env.WORKSPACE_MAX_FILE_BYTES ?? 524_288);

  return {
    workerId: env.WORKER_ID?.trim() || `worker-${hostname()}-${process.pid}`,
    pollIntervalMs: Number.isFinite(pollIntervalMs) && pollIntervalMs >= 500 ? pollIntervalMs : 2500,
    leaseDurationMs:
      Number.isFinite(leaseDurationMs) && leaseDurationMs >= 30_000 ? leaseDurationMs : 180_000,
    maxContextFiles: Number.isInteger(maxContextFiles) && maxContextFiles >= 5 ? maxContextFiles : 24,
    maxContextBytes:
      Number.isInteger(maxContextBytes) && maxContextBytes >= 8192 ? maxContextBytes : 96_000,
    sandboxEnabled,
    sandboxDockerImage,
    sandboxTimeoutMs:
      Number.isFinite(sandboxTimeoutMs) && sandboxTimeoutMs >= 5000 ? sandboxTimeoutMs : 60_000,
    workerHttpPort:
      Number.isInteger(workerHttpPort) && workerHttpPort > 0 && workerHttpPort < 65536
        ? workerHttpPort
        : 4100,
    workerBindHost,
    workerPublicWsUrl,
    internalAuthSecret: env.INTERNAL_AUTH_SECRET?.trim() || undefined,
    workspaceRootDir,
    workspaceSnapshotDir,
    workspaceStorageMode,
    terminalEnabled,
    terminalAllowedOrigins,
    terminalIdleMs:
      Number.isFinite(terminalIdleMs) && terminalIdleMs >= 10_000 ? terminalIdleMs : 600_000,
    maxFileBytes:
      Number.isFinite(maxFileBytes) && maxFileBytes >= 16_384 ? maxFileBytes : 524_288,
    github: appId && privateKey ? { appId, privateKey, apiBaseUrl: githubApiBaseUrl } : undefined,
    ai:
      provider && model && apiKey
        ? {
            provider,
            model,
            apiKey,
            apiBaseUrl,
            timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 45_000,
            priceInputPer1m: Number.isFinite(priceInputPer1m) ? priceInputPer1m : 0,
            priceOutputPer1m: Number.isFinite(priceOutputPer1m) ? priceOutputPer1m : 0,
          }
        : undefined,
  };
}
