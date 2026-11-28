export interface GitHubConfiguration {
  appId?: string;
  appSlug?: string;
  privateKey?: string;
  webhookSecret?: string;
  apiBaseUrl: string;
}

export type ConfiguredAiProvider = "openai" | "anthropic" | "openai-compatible";

export interface AiConfiguration {
  provider?: ConfiguredAiProvider;
  model?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  timeoutMs: number;
  priceInputPer1m: number;
  priceOutputPer1m: number;
  maxContextFiles: number;
  maxContextBytes: number;
  sandboxEnabled: boolean;
  sandboxDockerImage: string;
}

export interface WorkerClientConfiguration {
  baseUrl: string;
  terminalPublicWsUrl: string;
  requestTimeoutMs: number;
  workspaceTtlHours: number;
  workspaceMaxPerProject: number;
}

export interface AppConfiguration {
  http: { port: number; origins: string[] };
  DATABASE_URL?: string;
  INTERNAL_AUTH_SECRET?: string;
  github: GitHubConfiguration;
  ai: AiConfiguration;
  worker: WorkerClientConfiguration;
}

function readOrigin(value: string): string {
  const raw = value.trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("CORS_ORIGINS must contain complete HTTP or HTTPS origins.");
  }
  if (!["http:", "https:"].includes(url.protocol) || raw.replace(/\/$/, "") !== url.origin || raw.includes("*")) {
    throw new Error("CORS_ORIGINS accepts exact HTTP or HTTPS origins only.");
  }
  return url.origin;
}

export function normalizePrivateKeyPem(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
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

export function validateEnvironment(env: Record<string, unknown>): AppConfiguration {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const localOrigin = env.NODE_ENV === "production" ? "" : "http://localhost:3000";
  const setting = String(env.CORS_ORIGINS ?? localOrigin);
  const origins = setting.trim() ? setting.split(",").map(readOrigin) : [];
  const apiBaseRaw =
    typeof env.GITHUB_API_BASE_URL === "string" && env.GITHUB_API_BASE_URL.trim()
      ? readOrigin(env.GITHUB_API_BASE_URL)
      : "https://api.github.com";
  const appId =
    typeof env.GITHUB_APP_ID === "string" && env.GITHUB_APP_ID.trim()
      ? env.GITHUB_APP_ID.trim()
      : undefined;
  const appSlug =
    typeof env.GITHUB_APP_SLUG === "string" && env.GITHUB_APP_SLUG.trim()
      ? env.GITHUB_APP_SLUG.trim()
      : undefined;
  const privateKey = normalizePrivateKeyPem(env.GITHUB_APP_PRIVATE_KEY);
  const webhookSecret =
    typeof env.GITHUB_WEBHOOK_SECRET === "string" && env.GITHUB_WEBHOOK_SECRET.trim()
      ? env.GITHUB_WEBHOOK_SECRET.trim()
      : undefined;

  const rawAiProvider =
    typeof env.AI_PROVIDER === "string" && env.AI_PROVIDER.trim()
      ? env.AI_PROVIDER.trim().toLowerCase()
      : undefined;
  let aiProvider: ConfiguredAiProvider | undefined;
  if (rawAiProvider !== undefined) {
    if (
      rawAiProvider !== "openai" &&
      rawAiProvider !== "anthropic" &&
      rawAiProvider !== "openai-compatible"
    ) {
      throw new Error("AI_PROVIDER must be openai, anthropic, or openai-compatible.");
    }
    aiProvider = rawAiProvider;
  }

  const aiModel =
    typeof env.AI_MODEL === "string" && env.AI_MODEL.trim() ? env.AI_MODEL.trim() : undefined;
  const aiApiKey =
    typeof env.AI_API_KEY === "string" && env.AI_API_KEY.trim() ? env.AI_API_KEY.trim() : undefined;

  let aiApiBaseUrl: string | undefined;
  if (typeof env.AI_API_BASE_URL === "string" && env.AI_API_BASE_URL.trim()) {
    let parsed: URL;
    try {
      parsed = new URL(env.AI_API_BASE_URL.trim());
    } catch {
      throw new Error("AI_API_BASE_URL must be a valid HTTP or HTTPS URL.");
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("AI_API_BASE_URL must use HTTP or HTTPS.");
    }
    aiApiBaseUrl = parsed.toString().replace(/\/$/, "");
  }

  const aiTimeoutMs = env.AI_TIMEOUT_MS ? Number(env.AI_TIMEOUT_MS) : 45_000;
  if (!Number.isInteger(aiTimeoutMs) || aiTimeoutMs < 5_000 || aiTimeoutMs > 300_000) {
    throw new Error("AI_TIMEOUT_MS must be an integer between 5000 and 300000.");
  }

  const priceInputPer1m = env.AI_PRICE_INPUT_PER_1M ? Number(env.AI_PRICE_INPUT_PER_1M) : 0;
  const priceOutputPer1m = env.AI_PRICE_OUTPUT_PER_1M ? Number(env.AI_PRICE_OUTPUT_PER_1M) : 0;
  if (!Number.isFinite(priceInputPer1m) || priceInputPer1m < 0) {
    throw new Error("AI_PRICE_INPUT_PER_1M must be a non-negative number.");
  }
  if (!Number.isFinite(priceOutputPer1m) || priceOutputPer1m < 0) {
    throw new Error("AI_PRICE_OUTPUT_PER_1M must be a non-negative number.");
  }

  const maxContextFiles = env.AI_MAX_CONTEXT_FILES ? Number(env.AI_MAX_CONTEXT_FILES) : 24;
  if (!Number.isInteger(maxContextFiles) || maxContextFiles < 5 || maxContextFiles > 80) {
    throw new Error("AI_MAX_CONTEXT_FILES must be an integer between 5 and 80.");
  }

  const maxContextBytes = env.AI_MAX_CONTEXT_BYTES ? Number(env.AI_MAX_CONTEXT_BYTES) : 96_000;
  if (!Number.isInteger(maxContextBytes) || maxContextBytes < 8192 || maxContextBytes > 262_144) {
    throw new Error("AI_MAX_CONTEXT_BYTES must be an integer between 8192 and 262144.");
  }

  const sandboxEnabled = String(env.SANDBOX_ENABLED ?? "true").trim().toLowerCase() !== "false";
  const sandboxDockerImage =
    typeof env.SANDBOX_DOCKER_IMAGE === "string" && env.SANDBOX_DOCKER_IMAGE.trim()
      ? env.SANDBOX_DOCKER_IMAGE.trim()
      : "node:24-alpine";

  const workerUrlRaw =
    typeof env.WORKER_URL === "string" && env.WORKER_URL.trim()
      ? readOrigin(env.WORKER_URL)
      : "http://127.0.0.1:4100";

  let terminalPublicWsUrl = "ws://localhost:4100/terminal";
  if (typeof env.WORKER_TERMINAL_PUBLIC_URL === "string" && env.WORKER_TERMINAL_PUBLIC_URL.trim()) {
    let parsedWs: URL;
    try {
      parsedWs = new URL(env.WORKER_TERMINAL_PUBLIC_URL.trim());
    } catch {
      throw new Error("WORKER_TERMINAL_PUBLIC_URL must be a valid ws:// or wss:// URL.");
    }
    if (!["ws:", "wss:"].includes(parsedWs.protocol)) {
      throw new Error("WORKER_TERMINAL_PUBLIC_URL must use ws: or wss: protocol.");
    }
    terminalPublicWsUrl = parsedWs.toString().replace(/\/$/, "");
  }

  const workspaceTtlHours = env.WORKSPACE_TTL_HOURS ? Number(env.WORKSPACE_TTL_HOURS) : 24;
  if (!Number.isInteger(workspaceTtlHours) || workspaceTtlHours < 1 || workspaceTtlHours > 720) {
    throw new Error("WORKSPACE_TTL_HOURS must be an integer between 1 and 720.");
  }

  // ConfigModule copies only validated scalar values from .env into process.env.
  return {
    http: { port, origins },
    DATABASE_URL: typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : undefined,
    INTERNAL_AUTH_SECRET:
      typeof env.INTERNAL_AUTH_SECRET === "string" ? env.INTERNAL_AUTH_SECRET : undefined,
    github: {
      appId,
      appSlug,
      privateKey,
      webhookSecret,
      apiBaseUrl: apiBaseRaw,
    },
    ai: {
      provider: aiProvider,
      model: aiModel,
      apiKey: aiApiKey,
      apiBaseUrl: aiApiBaseUrl,
      timeoutMs: aiTimeoutMs,
      priceInputPer1m,
      priceOutputPer1m,
      maxContextFiles,
      maxContextBytes,
      sandboxEnabled,
      sandboxDockerImage,
    },
    worker: {
      baseUrl: workerUrlRaw,
      terminalPublicWsUrl,
      requestTimeoutMs: 30_000,
      workspaceTtlHours,
      workspaceMaxPerProject: 10,
    },
  };
}
