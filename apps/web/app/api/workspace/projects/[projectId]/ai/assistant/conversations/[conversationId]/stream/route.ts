import { relayOrgProjectStream } from "@/lib/server/ide-bff";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; conversationId: string }> },
) {
  const { projectId, conversationId } = await context.params;
  return relayOrgProjectStream(
    request,
    projectId,
    `ai/assistant/conversations/${encodeURIComponent(conversationId)}/stream`,
  );
}
