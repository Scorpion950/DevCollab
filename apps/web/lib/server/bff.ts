import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { WorkspaceBootstrap } from "@devcollab/shared";
import { apiUserFetch, type ApiResult } from "./backend";
import { ACTIVE_ORG_COOKIE } from "./dal";
import { getCachedSession } from "./session";

const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" };

export function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function relayApiResult<T>(res: ApiResult<T>, okStatus = 200) {
  if (!res.ok) {
    return jsonNoStore({ message: res.message }, res.status);
  }
  return jsonNoStore(res.data, okStatus);
}

export async function requireBffOrgSession(request?: Request): Promise<
  | { ok: true; userId: string; orgId: string | null }
  | { ok: false; response: NextResponse }
> {
  if (request && request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (origin && host) {
      try {
        if (new URL(origin).host !== host) {
          return { ok: false, response: jsonNoStore({ message: "Cross-origin request rejected." }, 403) };
        }
      } catch {
        return { ok: false, response: jsonNoStore({ message: "Invalid origin." }, 403) };
      }
    }
  }

  const [session, cookieStore] = await Promise.all([getCachedSession(), cookies()]);
  if (!session?.user?.id) {
    return { ok: false, response: jsonNoStore({ message: "Authentication required." }, 401) };
  }

  const userId = session.user.id;
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value?.trim() || "";
  if (cookieOrgId) {
    return { ok: true, userId, orgId: cookieOrgId };
  }

  const bootstrap = await apiUserFetch<WorkspaceBootstrap>(userId, "/workspace/bootstrap");
  if (!bootstrap.ok) {
    return { ok: false, response: jsonNoStore({ message: bootstrap.message }, bootstrap.status) };
  }

  return {
    ok: true,
    userId,
    orgId: bootstrap.data.activeOrganization?.id ?? null,
  };
}
