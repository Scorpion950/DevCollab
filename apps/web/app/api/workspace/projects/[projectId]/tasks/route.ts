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
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks${suffix}`,
  );
  return relayApiResult(res);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const [auth, { projectId }] = await Promise.all([requireBffOrgSession(request), context.params]);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/tasks`,
    { method: "POST", body: body ?? {} },
  );
  return relayApiResult(res, 201);
}
