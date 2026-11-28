import { relayOrgProjectGet } from "@/lib/server/ide-bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return relayOrgProjectGet(projectId, "ai/assistant/status");
}
