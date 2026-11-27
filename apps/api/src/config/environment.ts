export interface GitHubConfiguration {
  appId?: string;
  appSlug?: string;
  privateKey?: string;
  webhookSecret?: string;
  apiBaseUrl: string;
}

export interface AppConfiguration {
  http: { port: number; origins: string[] };
  DATABASE_URL?: string;
  INTERNAL_AUTH_SECRET?: string;
  github: GitHubConfiguration;
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

  // ConfigModule copies only validated scalar values from .env into process.env.
  return {
    http: { port, origins },
    DATABASE_URL: typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : undefined,
    INTERNAL_AUTH_SECRET: typeof env.INTERNAL_AUTH_SECRET === "string" ? env.INTERNAL_AUTH_SECRET : undefined,
    github: {
      appId,
      appSlug,
      privateKey,
      webhookSecret,
      apiBaseUrl: apiBaseRaw,
    },
  };
}
