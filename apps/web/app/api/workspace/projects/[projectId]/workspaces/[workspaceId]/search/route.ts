import { relayOrgProjectGet } from "@/lib/server/ide-bff";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  const sp = new URL(request.url).searchParams;
  const q = sp.get("q") ?? "";
  const mode = sp.get("mode") === "text" ? "text" : "files";
  return relayOrgProjectGet(
    projectId,
    `workspaces/${encodeURIComponent(workspaceId)}/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}`,
  );
}
