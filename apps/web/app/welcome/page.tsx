import { currentProfile } from "@/lib/server/current-profile";
import { safeInvitePath } from "@/lib/server/session";
import { ProfileUnavailable } from "@/components/profile-unavailable";
import { WelcomeTransition } from "@/components/welcome-transition";
import "../workspace.css";

export const dynamic = "force-dynamic";

export default async function Welcome({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [profile, { next }] = await Promise.all([currentProfile(), searchParams]);
  if (!profile) return <ProfileUnavailable />;
  const destination = safeInvitePath(next) ?? "/app";
  return (
    <WelcomeTransition
      firstName={profile.name.trim().split(/\s+/)[0] || "builder"}
      loginId={profile.session.loginId}
      destination={destination}
    />
  );
}
