import { relayOrgProjectGet, relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; conversationId: string }> },
) {
  const { projectId, conversationId } = await context.params;
  return relayOrgProjectGet(
    projectId,
    `ai/assistant/conversations/${encodeURIComponent(conversationId)}`,
  );
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; conversationId: string }> },
) {
  const { projectId, conversationId } = await context.params;
  return relayOrgProjectMutation(
    request,
    projectId,
    `ai/assistant/conversations/${encodeURIComponent(conversationId)}`,
    "DELETE",
  );
}
