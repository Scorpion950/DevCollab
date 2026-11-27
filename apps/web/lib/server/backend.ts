import "server-only";
import { SignJWT } from "jose";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

let cachedSecret: string | undefined;
let cachedKey: Uint8Array | undefined;

function getSecretKey(): Uint8Array | null {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  if (cachedSecret !== secret || !cachedKey) {
    cachedSecret = secret;
    cachedKey = new TextEncoder().encode(secret);
  }
  return cachedKey;
}

function getApiBaseUrl(): string | null {
  const base = process.env.API_BASE_URL;
  return base ? base.replace(/\/$/, "") : null;
}

export async function signUserAssertion(userId: string): Promise<string | null> {
  const key = getSecretKey();
  if (!key) return null;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web")
    .setAudience("devcollab-api")
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(key);
}

export async function signServiceAssertion(): Promise<string | null> {
  const key = getSecretKey();
  if (!key) return null;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web")
    .setAudience("devcollab-api-service")
    .setIssuedAt()
    .setExpirationTime("30s")
    .sign(key);
}

async function performApiFetch<T>(
  path: string,
  token: string | null,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const base = getApiBaseUrl();
  if (!base || !token) {
    return {
      ok: false,
      status: 503,
      message: "Backend API configuration is incomplete.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path.startsWith("/") ? path : `/${path}`}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    return {
      ok: false,
      status: 503,
      message: "Could not reach the DevCollab API. Please try again.",
    };
  }

  const parsed = await response.json().catch(() => null);
  if (!response.ok) {
    const rawMessage =
      parsed && typeof parsed === "object" && "message" in parsed
        ? (parsed as { message?: unknown }).message
        : null;
    const message = Array.isArray(rawMessage)
      ? String(rawMessage[0] ?? "Request failed.")
      : typeof rawMessage === "string" && rawMessage.trim()
        ? rawMessage
        : response.status === 403
          ? "You do not have permission to perform this action."
          : response.status === 404
            ? "The requested resource was not found."
            : "The request could not be completed. Please try again.";
    return { ok: false, status: response.status, message };
  }

  return { ok: true, data: parsed as T };
}

export async function apiUserFetch<T>(
  userId: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = await signUserAssertion(userId);
  return performApiFetch<T>(path, token, init);
}

export async function apiServiceFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<ApiResult<T>> {
  const token = await signServiceAssertion();
  return performApiFetch<T>(path, token, init);
}
