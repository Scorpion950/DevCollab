import "server-only";
import type { HealthResponse } from "@devcollab/shared";

type HealthResult = { ok: true; data: HealthResponse } | { ok: false; message: string };

async function apiRequest(path: string) {
  const base = process.env.API_BASE_URL;
  if (!base) throw new Error("API_BASE_URL is missing");
  return fetch(new URL(path, base.replace(/\/?$/, "/")), {
    headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(3500),
  });
}

export async function getApiHealth(): Promise<HealthResult> {
  if (!process.env.API_BASE_URL) return { ok: false, message: "Set API_BASE_URL in apps/web/.env.local and restart the frontend." };
  try {
    const response = await apiRequest("health");
    if (!response.ok) return { ok: false, message: `The API returned HTTP ${response.status}. Check the configured API prefix.` };
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null && "status" in body && body.status === "ok" &&
        "service" in body && body.service === "devcollab-api") {
      return { ok: true, data: { status: body.status, service: body.service } };
    }
    return { ok: false, message: "The response did not match the DevCollab health contract." };
  } catch {
    return { ok: false, message: "Could not read the health endpoint. Start the API and check API_BASE_URL." };
  }
}
