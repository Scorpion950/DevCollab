import { relayOrgProjectMutation } from "@/lib/server/ide-bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; conversationId: string; messageId: string }> },
) {
  const { projectId, conversationId, messageId } = await context.params;
  return relayOrgProjectMutation(
    request,
    projectId,
    `ai/assistant/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/apply-proposal`,
    "POST",
  );
}
