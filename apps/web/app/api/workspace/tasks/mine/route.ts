import { apiUserFetch } from "@/lib/server/backend";
import { relayApiResult, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(request: Request) {
  const auth = await requireBffOrgSession();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const params = new URLSearchParams();
  const scope = url.searchParams.get("scope") === "all" ? "all" : "org";
  const filter = url.searchParams.get("filter") ?? "active";
  params.set("scope", scope);
  params.set("filter", filter);
  if (scope !== "all" && auth.orgId) {
    params.set("orgId", auth.orgId);
  }

  const res = await apiUserFetch(auth.userId, `/tasks/mine?${params.toString()}`);
  return relayApiResult(res);
}
