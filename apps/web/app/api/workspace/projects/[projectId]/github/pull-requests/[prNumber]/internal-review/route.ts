import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string; prNumber: string }> },
) {
  const [auth, { projectId, prNumber }] = await Promise.all([
    requireBffOrgSession(request),
    context.params,
  ]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/github/pull-requests/${encodeURIComponent(prNumber)}/internal-review`,
    { method: "PUT", body: body ?? {} },
  );
  return relayApiResult(res);
}
