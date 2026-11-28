import { relayOrgProjectGet } from "@/lib/server/ide-bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; sessionId: string }> },
) {
  const { projectId, sessionId } = await context.params;
  return relayOrgProjectGet(projectId, `collab/sessions/${encodeURIComponent(sessionId)}`);
}
