import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const [auth, { projectId }] = await Promise.all([requireBffOrgSession(), context.params]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const search = new URL(request.url).searchParams.toString();
  const suffix = search ? `?${search}` : "";
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/github/pull-requests${suffix}`,
  );
  return relayApiResult(res);
}
