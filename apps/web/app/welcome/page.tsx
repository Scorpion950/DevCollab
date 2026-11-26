import { currentProfile } from "@/lib/server/current-profile";
import { ProfileUnavailable } from "@/components/profile-unavailable";
import { WelcomeTransition } from "@/components/welcome-transition";
import "../workspace.css";
export const dynamic = "force-dynamic";
export default async function Welcome() {
  const profile = await currentProfile();
  if (!profile) return <ProfileUnavailable/>;
  return <WelcomeTransition firstName={profile.name.trim().split(/\s+/)[0] || "builder"} loginId={profile.loginId}/>;
}
