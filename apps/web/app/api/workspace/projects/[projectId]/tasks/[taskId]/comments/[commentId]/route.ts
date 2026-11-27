import { apiUserFetch } from "@/lib/server/backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string; commentId: string }> },
) {
  const [auth, { projectId, taskId, commentId }] = await Promise.all([
    requireBffOrgSession(request),
    context.params,
  ]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "PATCH", body: body ?? {} },
  );
  return relayApiResult(res);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ projectId: string; taskId: string; commentId: string }> },
) {
  const [auth, { projectId, taskId, commentId }] = await Promise.all([
    requireBffOrgSession(request),
    context.params,
  ]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
  return relayApiResult(res);
}
