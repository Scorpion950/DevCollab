import { NextResponse } from "next/server";
import { apiUserRawResponse } from "@/lib/server/backend";
import { jsonNoStore, requireBffOrgSession } from "@/lib/server/bff";

export async function GET(request: Request) {
  const auth = await requireBffOrgSession();
  if (!auth.ok) return auth.response;
  if (!auth.orgId) return jsonNoStore({ message: "No active organization selected." }, 400);

  const url = new URL(request.url);
  const params = new URLSearchParams();
  for (const key of ["scope", "dataset", "projectId", "preset", "from", "to", "timezone"]) {
    const val = url.searchParams.get(key);
    if (val) params.set(key, val);
  }
  const qs = params.toString();

  const upstream = await apiUserRawResponse(
    auth.userId,
    `/organizations/${encodeURIComponent(auth.orgId)}/analytics/export${qs ? `?${qs}` : ""}`,
  );
  if (!upstream) {
    return jsonNoStore({ message: "Could not reach the DevCollab API." }, 503);
  }

  if (!upstream.ok) {
    const parsed = await upstream.json().catch(() => null);
    const msg =
      parsed && typeof parsed === "object" && "message" in parsed
        ? String((parsed as { message?: unknown }).message ?? "Export failed.")
        : "Export could not be completed.";
    return jsonNoStore({ message: msg }, upstream.status);
  }

  const csvBody = await upstream.text();
  const disposition =
    upstream.headers.get("content-disposition") ?? 'attachment; filename="devcollab-analytics.csv"';

  return new NextResponse(csvBody, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
