import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(request: Request) {
  const auth = await requireBffOrgSession();
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
    `/organizations/${encodeURIComponent(auth.orgId)}/analytics/personal${qs ? `?${qs}` : ""}`,
  );
  return relayApiResult(res);
}
