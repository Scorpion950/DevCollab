import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { authSettings } from "@/lib/server/auth-settings";
import { getCachedSession, safeInvitePath } from "@/lib/server/session";

export const metadata = { title: "Create an account · DevCollab" };
export const dynamic = "force-dynamic";

export default async function SignUp({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const [session, { callbackUrl }] = await Promise.all([getCachedSession(), searchParams]);
  const safeCallback = safeInvitePath(callbackUrl);
  if (session?.user?.id) {
    redirect(safeCallback ?? "/app");
  }
  return <AuthPanel signup settings={authSettings()} callbackUrl={safeCallback} />;
}
