import { relayOrgProjectGet, relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  const path = new URL(request.url).searchParams.get("path") ?? "";
  return relayOrgProjectGet(
    projectId,
    `workspaces/${encodeURIComponent(workspaceId)}/file?path=${encodeURIComponent(path)}`,
  );
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  return relayOrgProjectMutation(
    request,
    projectId,
    `workspaces/${encodeURIComponent(workspaceId)}/file`,
    "PUT",
  );
}
