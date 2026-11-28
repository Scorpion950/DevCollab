import { relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; sessionId: string }> },
) {
  const { projectId, sessionId } = await context.params;
  return relayOrgProjectMutation(request, projectId, `collab/sessions/${encodeURIComponent(sessionId)}/join`, "POST");
}
