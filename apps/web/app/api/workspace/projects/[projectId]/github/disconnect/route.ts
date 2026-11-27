import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const [auth, { projectId }] = await Promise.all([requireBffOrgSession(request), context.params]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/github/disconnect`,
    { method: "POST" },
  );
  return relayApiResult(res);
}
