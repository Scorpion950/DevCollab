import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET() {
  const auth = await requireBffOrgSession();
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/analytics/budgets`,
  );
  return relayApiResult(res);
}

export async function PUT(request: Request) {
  const auth = await requireBffOrgSession(request);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/analytics/budgets/organization`,
    { method: "PUT", body: body ?? {} },
  );
  return relayApiResult(res);
}
