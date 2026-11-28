import { relayOrgProjectGet } from "@/lib/server/ide-bff";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string; workspaceId: string }> },
) {
  const { projectId, workspaceId } = await context.params;
  const sp = new URL(request.url).searchParams;
  const params = new URLSearchParams();
  if (sp.get("scope")) params.set("scope", sp.get("scope")!);
  if (sp.get("path")) params.set("path", sp.get("path")!);
  if (sp.get("sha")) params.set("sha", sp.get("sha")!);
  const qs = params.toString() ? `?${params.toString()}` : "";
  return relayOrgProjectGet(projectId, `workspaces/${encodeURIComponent(workspaceId)}/git/diff${qs}`);
}
