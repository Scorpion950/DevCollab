import { relayOrgProjectGet } from "@/lib/server/ide-bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  return relayOrgProjectGet(projectId, `workspaces/${encodeURIComponent(workspaceId)}/tree`);
}
