import { relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  return relayOrgProjectMutation(request, projectId, "workspaces", "POST");
}
