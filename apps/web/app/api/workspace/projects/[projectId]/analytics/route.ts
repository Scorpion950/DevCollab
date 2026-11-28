import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const [auth, { projectId }] = await Promise.all([requireBffOrgSession(), context.params]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["preset", "from", "to", "timezone", "page", "pageSize", "refresh"]) {
    const val = url.searchParams.get(key);
    if (val) params.set(key, val);
  }
  const qs = params.toString();

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/analytics${qs ? `?${qs}` : ""}`,
  );
  return relayApiResult(res);
}
