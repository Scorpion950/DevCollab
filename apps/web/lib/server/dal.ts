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

export const getWorkspaceBootstrap = cache(
  async (): Promise<AuthenticatedContext | null> => {
    const [session, cookieStore] = await Promise.all([getAuthenticatedSession(), cookies()]);
    const requestedOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value ?? "";
    const query = requestedOrgId ? `?orgId=${encodeURIComponent(requestedOrgId)}` : "";
    const result = await apiUserFetch<WorkspaceBootstrap>(
      session.user!.id!,
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
