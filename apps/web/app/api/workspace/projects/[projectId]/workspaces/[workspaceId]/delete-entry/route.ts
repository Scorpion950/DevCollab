import { relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  return relayOrgProjectMutation(request, projectId, `workspaces/${encodeURIComponent(workspaceId)}/delete-entry`);
}
