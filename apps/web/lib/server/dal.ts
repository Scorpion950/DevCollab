import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Session } from "next-auth";
import type { WorkspaceBootstrap } from "@devcollab/shared";
import { authSettings } from "./auth-settings";
import { apiUserFetch } from "./backend";
import { getCachedSession } from "./session";

export const ACTIVE_ORG_COOKIE = "devcollab.active.org";
export const WORKSPACE_THEME_COOKIE = "devcollab.workspace.theme";

export interface AuthenticatedContext {
  session: Session;
  bootstrap: WorkspaceBootstrap;
}

export const getWorkspaceTheme = cache(async (): Promise<"dark" | "light"> => {
  const cookieStore = await cookies();
  return cookieStore.get(WORKSPACE_THEME_COOKIE)?.value === "light" ? "light" : "dark";
});

export const getAuthenticatedSession = cache(async (): Promise<Session> => {
  if (!authSettings().ready) redirect("/auth/sign-in");
  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/auth/sign-in");
  return session;
});

export const getRequestOrgHint = cache(async () => {
  const [session, cookieStore] = await Promise.all([getAuthenticatedSession(), cookies()]);
  return {
    userId: session.user!.id!,
    requestedOrgId: cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? "",
  };
});

export const getWorkspaceBootstrap = cache(
  async (): Promise<AuthenticatedContext | null> => {
    const [session, { userId, requestedOrgId }] = await Promise.all([
      getAuthenticatedSession(),
      getRequestOrgHint(),
    ]);
    const query = requestedOrgId ? `?orgId=${encodeURIComponent(requestedOrgId)}` : "";
    const result = await apiUserFetch<WorkspaceBootstrap>(
      userId,
      `/workspace/bootstrap${query}`,
    );

    if (!result.ok) {
      if (result.status === 401) {
        redirect("/auth/sign-in?error=SessionRequired");
      }
      return null;
    }

    return { session, bootstrap: result.data };
  },
);

/**
 * Overlaps page-specific NestJS data loading with WorkspaceBootstrap whenever
 * the active org cookie hint is present, eliminating sequential SSR waterfalls
 * while keeping strict server-side org/RBAC fallback when no hint matches.
 */
export async function loadWithActiveOrg<T>(
  fetcher: (userId: string, orgId: string) => Promise<T>,
): Promise<{
  ctx: AuthenticatedContext | null;
  data: T | null;
}> {
  const { userId, requestedOrgId } = await getRequestOrgHint();
  if (!requestedOrgId) {
    const ctx = await getWorkspaceBootstrap();
    const activeOrgId = ctx?.bootstrap.activeOrganization?.id;
    if (!ctx || !activeOrgId) return { ctx, data: null };
    const data = await fetcher(userId, activeOrgId);
    return { ctx, data };
  }

  const [ctx, hintedData] = await Promise.all([
    getWorkspaceBootstrap(),
    fetcher(userId, requestedOrgId),
  ]);
  const activeOrgId = ctx?.bootstrap.activeOrganization?.id;
  if (!ctx || !activeOrgId) return { ctx, data: null };
  if (activeOrgId === requestedOrgId) {
    return { ctx, data: hintedData };
  }
  const freshData = await fetcher(userId, activeOrgId);
  return { ctx, data: freshData };
}
