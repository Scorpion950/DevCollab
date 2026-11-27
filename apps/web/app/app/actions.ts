"use server";

import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type {
  CreatedInvitationDto,
  OrganizationRole,
  OrganizationSummary,
  ProjectDetailDto,
  ProjectRole,
} from "@devcollab/shared";
import { apiUserFetch } from "@/lib/server/backend";
import { ACTIVE_ORG_COOKIE, getAuthenticatedSession } from "@/lib/server/dal";

export interface ActionState {
  error?: string;
  success?: string;
  inviteUrl?: string;
  invitedEmail?: string;
  invitedRole?: OrganizationRole;
}

function setActiveOrgCookie(cookieStore: Awaited<ReturnType<typeof cookies>>, orgId: string) {
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
}

async function resolveAppOrigin(): Promise<string> {
  if (process.env.AUTH_URL) {
    return process.env.AUTH_URL.replace(/\/$/, "");
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function switchOrganizationAction(orgId: string) {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch<OrganizationSummary>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}`,
  );
  if (!res.ok) {
    return { error: res.message };
  }
  const cookieStore = await cookies();
  setActiveOrgCookie(cookieStore, res.data.id);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function createOrganizationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const name = String(formData.get("name") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const description = String(formData.get("description") ?? "");

  const res = await apiUserFetch<OrganizationSummary>(session.user!.id!, "/organizations", {
    method: "POST",
    body: { name, slug, description },
  });

  if (!res.ok) {
    return { error: res.message };
  }

  const cookieStore = await cookies();
  setActiveOrgCookie(cookieStore, res.data.id);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function updateOrganizationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");

  const res = await apiUserFetch<OrganizationSummary>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      body: { name, description },
    },
  );

  if (!res.ok) {
    return { error: res.message };
  }

  revalidatePath("/app", "layout");
  return { success: "Organization settings updated." };
}

export async function leaveOrganizationAction(orgId: string): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch<{ left: true }>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/leave`,
    { method: "POST" },
  );

  if (!res.ok) {
    return { error: res.message };
  }

  const cookieStore = await cookies();
  if (cookieStore.get(ACTIVE_ORG_COOKIE)?.value === orgId) {
    cookieStore.delete(ACTIVE_ORG_COOKIE);
  }
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function updateMemberRoleAction(
  orgId: string,
  memberId: string,
  role: "ADMIN" | "MEMBER",
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}/role`,
    { method: "PATCH", body: { role } },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: `Member role updated to ${role === "ADMIN" ? "Admin" : "Member"}.` };
}

export async function transferOwnershipAction(
  orgId: string,
  targetMemberId: string,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/transfer-ownership`,
    { method: "POST", body: { targetMemberId } },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: "Organization ownership transferred." };
}

export async function removeMemberAction(orgId: string, memberId: string): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: "Member removed from the organization." };
}

export async function createInvitationAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "MEMBER");

  const res = await apiUserFetch<CreatedInvitationDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/invitations`,
    { method: "POST", body: { email, role } },
  );

  if (!res.ok) return { error: res.message };

  const origin = await resolveAppOrigin();
  const inviteUrl = `${origin}/invitations/${res.data.token}`;
  revalidatePath("/app/invitations");
  revalidatePath("/app");
  return {
    success: "Secure invitation link created. Share it directly — no email was sent.",
    inviteUrl,
    invitedEmail: res.data.invitation.email,
    invitedRole: res.data.invitation.role,
  };
}

export async function revokeInvitationAction(
  orgId: string,
  invitationId: string,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/invitations/${encodeURIComponent(invitationId)}/revoke`,
    { method: "POST" },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app/invitations");
  revalidatePath("/app");
  return { success: "Invitation revoked." };
}

export async function acceptInvitationAction(token: string): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch<{ organizationId: string }>(
    session.user!.id!,
    "/invitations/accept",
    { method: "POST", body: { token } },
  );
  if (!res.ok) return { error: res.message };

  const cookieStore = await cookies();
  setActiveOrgCookie(cookieStore, res.data.organizationId);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function createProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const name = String(formData.get("name") ?? "");
  const key = String(formData.get("key") ?? "");
  const description = String(formData.get("description") ?? "");
  const status = String(formData.get("status") ?? "ACTIVE");
  const projectManagerId = String(formData.get("projectManagerId") ?? "").trim();

  const res = await apiUserFetch<ProjectDetailDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/projects`,
    {
      method: "POST",
      body: {
        name,
        key,
        description,
        status,
        ...(projectManagerId ? { projectManagerId } : {}),
      },
    },
  );

  if (!res.ok) return { error: res.message };

  revalidatePath("/app", "layout");
  redirect(`/app/projects/${res.data.id}`);
}

export async function updateProjectAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const orgId = String(formData.get("orgId") ?? "").trim();
  const projectId = String(formData.get("projectId") ?? "").trim();
  const name = String(formData.get("name") ?? "");
  const keyRaw = formData.get("key");
  const description = String(formData.get("description") ?? "");

  const res = await apiUserFetch<ProjectDetailDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`,
    {
      method: "PATCH",
      body: {
        name,
        description,
        ...(typeof keyRaw === "string" && keyRaw.trim() ? { key: keyRaw } : {}),
      },
    },
  );

  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: "Project details saved." };
}

export async function setProjectArchiveAction(
  orgId: string,
  projectId: string,
  archive: boolean,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const action = archive ? "archive" : "restore";
  const res = await apiUserFetch<ProjectDetailDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/${action}`,
    { method: "POST" },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: archive ? "Project archived." : "Project restored." };
}

export async function assignProjectRoleAction(
  orgId: string,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch<ProjectDetailDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/roles`,
    { method: "PUT", body: { userId, role } },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return {
    success: `Assigned ${role === "PROJECT_MANAGER" ? "Project Manager" : "Developer"} role.`,
  };
}

export async function removeProjectRoleAction(
  orgId: string,
  projectId: string,
  userId: string,
): Promise<ActionState> {
  const session = await getAuthenticatedSession();
  const res = await apiUserFetch<ProjectDetailDto>(
    session.user!.id!,
    `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/roles/${encodeURIComponent(userId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { error: res.message };
  revalidatePath("/app", "layout");
  return { success: "Project role removed." };
}
