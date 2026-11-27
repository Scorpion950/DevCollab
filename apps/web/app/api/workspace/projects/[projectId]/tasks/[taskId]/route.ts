import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const [auth, { projectId, taskId }] = await Promise.all([requireBffOrgSession(), context.params]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
  );
  return relayApiResult(res);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string }> },
) {
  const [auth, { projectId, taskId }] = await Promise.all([
    requireBffOrgSession(request),
    context.params,
  ]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", body: body ?? {} },
  );
  return relayApiResult(res);
}
