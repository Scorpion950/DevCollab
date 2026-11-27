import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { GitHubInstallationDto } from "@devcollab/shared";
import { apiUserFetch } from "@/lib/server/backend";
import { ACTIVE_ORG_COOKIE } from "@/lib/server/dal";
import { getCachedSession } from "@/lib/server/session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.AUTH_URL?.replace(/\/$/, "") || url.origin;
  const session = await getCachedSession();
  if (!session?.user?.id) {
    const signIn = new URL("/auth/sign-in", origin);
    signIn.searchParams.set("callbackUrl", `${url.pathname}${url.search}`);
    return NextResponse.redirect(signIn);
  }

  const state = url.searchParams.get("state") ?? "";
  const installationId = url.searchParams.get("installation_id") ?? "";
  const setupAction = url.searchParams.get("setup_action") ?? "install";

  if (!state) {
    return NextResponse.redirect(new URL("/app/projects?githubError=missing_state", origin));
  }

  const res = await apiUserFetch<{
    status: "ready" | "cancelled";
    organizationId: string;
    projectId: string;
    installation?: GitHubInstallationDto;
  }>(session.user.id, "/integrations/github/callback", {
    method: "POST",
    body: { state, installationId, setupAction },
  });

  if (!res.ok) {
    const fallback = new URL("/app/projects", origin);
    fallback.searchParams.set("githubError", res.message.slice(0, 140));
    return NextResponse.redirect(fallback);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, res.data.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production" && origin.startsWith("https://"),
  });

  const dest = new URL(`/app/projects/${encodeURIComponent(res.data.projectId)}/repository`, origin);
  if (res.data.status === "cancelled") {
    dest.searchParams.set("setup", "cancelled");
  } else if (res.data.installation) {
    dest.searchParams.set("setup", "select");
    dest.searchParams.set("installationId", res.data.installation.githubInstallationId);
  }
  return NextResponse.redirect(dest);
}
