export interface AppConfiguration {
  http: { port: number; origins: string[] };
  DATABASE_URL?: string;
  INTERNAL_AUTH_SECRET?: string;
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

export function validateEnvironment(env: Record<string, unknown>): AppConfiguration {
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  const localOrigin = env.NODE_ENV === "production" ? "" : "http://localhost:3000";
  const setting = String(env.CORS_ORIGINS ?? localOrigin);
  const origins = setting.trim() ? setting.split(",").map(readOrigin) : [];
  // ConfigModule copies only validated scalar values from .env into process.env.
  return {
    http: { port, origins },
    DATABASE_URL: typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : undefined,
    INTERNAL_AUTH_SECRET: typeof env.INTERNAL_AUTH_SECRET === "string" ? env.INTERNAL_AUTH_SECRET : undefined,
  };
}
