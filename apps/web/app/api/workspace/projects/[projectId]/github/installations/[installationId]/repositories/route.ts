import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; installationId: string }> },
) {
  const [auth, { projectId, installationId }] = await Promise.all([
    requireBffOrgSession(),
    context.params,
  ]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/github/installations/${encodeURIComponent(installationId)}/repositories`,
  );
  return relayApiResult(res);
}
