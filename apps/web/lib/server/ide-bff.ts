import "server-only";
import { apiUserFetch, signUserAssertion } from "./backend";
import { jsonNoStore, relayApiResult, requireBffOrgSession } from "./bff";

export async function relayOrgProjectGet(
  projectId: string,
  suffix: string,
) {
  const auth = await requireBffOrgSession();
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/${suffix}`,
  );
  return relayApiResult(res);
}

export async function relayOrgProjectMutation(
  request: Request,
  projectId: string,
  suffix: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE" = "POST",
) {
  const auth = await requireBffOrgSession(request);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const body = method === "DELETE" ? undefined : await request.json().catch(() => null);
  const res = await apiUserFetch(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/${suffix}`,
    method === "DELETE" ? { method } : { method, body: body ?? {} },
  );
  return relayApiResult(res);
}

export async function relayOrgProjectStream(
  request: Request,
  projectId: string,
  suffix: string,
) {
  const auth = await requireBffOrgSession(request);
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const base = process.env.API_BASE_URL?.replace(/\/$/, "");
  const token = await signUserAssertion(auth.userId);
  if (!base || !token) {
    return jsonNoStore({ message: "Backend API configuration is incomplete." }, 503);
  }

  const body = await request.json().catch(() => ({}));
  let upstream: Response;
  try {
    upstream = await fetch(
      `${base}/organizations/${encodeURIComponent(auth.orgId)}/projects/${encodeURIComponent(projectId)}/${suffix}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body ?? {}),
        cache: "no-store",
        redirect: "error",
        signal: request.signal,
      },
    );
  } catch (err) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    return jsonNoStore(
      { message: err instanceof Error ? err.message : "Could not connect to AI stream." },
      503,
    );
  }

  if (!upstream.ok) {
    const parsed = await upstream.json().catch(() => null);
    const msg =
      parsed && typeof parsed === "object" && "message" in parsed && typeof parsed.message === "string"
        ? parsed.message
        : `Streaming request failed (${upstream.status}).`;
    return jsonNoStore({ message: msg }, upstream.status);
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
