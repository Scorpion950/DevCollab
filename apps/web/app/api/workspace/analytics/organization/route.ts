import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

function buildAnalyticsQuery(url: URL): string {
  const params = new URLSearchParams();
  for (const key of ["preset", "from", "to", "timezone", "page", "pageSize", "refresh"]) {
    const val = url.searchParams.get(key);
    if (val) params.set(key, val);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function GET(request: Request) {
  const auth = await requireBffOrgSession();
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const qs = buildAnalyticsQuery(new URL(request.url));
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/analytics/organization${qs}`,
  );
  return relayApiResult(res);
}
