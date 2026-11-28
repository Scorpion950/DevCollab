import { relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; sessionId: string; userId: string }> },
) {
  const { projectId, sessionId, userId } = await context.params;
  return relayOrgProjectMutation(
    request,
    projectId,
    `collab/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(userId)}`,
    "PATCH",
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; sessionId: string; userId: string }> },
) {
  const { projectId, sessionId, userId } = await context.params;
  return relayOrgProjectMutation(
    request,
    projectId,
    `collab/sessions/${encodeURIComponent(sessionId)}/participants/${encodeURIComponent(userId)}`,
    "DELETE",
  );
}
