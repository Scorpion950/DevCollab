import "server-only";
import { redirect } from "next/navigation";
import { SignJWT } from "jose";
import { authSettings } from "./auth-settings";
import { getCachedSession } from "./session";

export async function currentProfile() {
  if (!authSettings().ready) redirect("/auth/sign-in");
  const session = await getCachedSession();
  if (!session?.user?.id) redirect("/auth/sign-in");
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret || secret.length < 32 || !process.env.API_BASE_URL) return null;

  const assertion = await new SignJWT({}).setProtectedHeader({ alg: "HS256" })
    .setIssuer("devcollab-web").setAudience("devcollab-api").setSubject(session.user.id)
    .setIssuedAt().setExpirationTime("30s").sign(new TextEncoder().encode(secret));
  let response;
  try {
    response = await fetch(process.env.API_BASE_URL.replace(/\/$/,"") + "/users/me", {
      headers: { Authorization: "Bearer " + assertion }, cache: "no-store", redirect: "error",
      // Allow the API's 10-second database connection window plus time for the query.
      signal: AbortSignal.timeout(15_000),
    });
  } catch { return null; }
  if (response.status === 401) redirect("/auth/sign-in?error=SessionRequired");
  if (!response.ok) return null;
  const data = await response.json().catch(() => null);
  if (!data || data.id !== session.user.id || typeof data.email !== "string") return null;
  return { session, email: data.email as string,
    name: typeof data.name === "string" ? data.name as string : "",
    image: typeof data.image === "string" && /^https:\/\//.test(data.image) ? data.image as string : null };
}
