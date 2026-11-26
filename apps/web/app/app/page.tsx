import { cookies } from "next/headers";
import { currentProfile } from "@/lib/server/current-profile";
import { WorkspaceThemeProvider } from "@/components/workspace-theme/workspace-theme";
import { ProfileUnavailable } from "@/components/profile-unavailable";
import { AccountMenu } from "@/components/account-menu";
import { Wordmark } from "@/components/brand";
import { Folder } from "lucide-react";
import "../workspace.css";
export const dynamic = "force-dynamic";
export default async function Workspace() {
  const profile = await currentProfile();
  if (!profile) return <ProfileUnavailable/>;
  const theme = (await cookies()).get("devcollab.workspace.theme")?.value === "light" ? "light" : "dark";
  return <WorkspaceThemeProvider initialTheme={theme}><div className="workspace-entry">
    <header className="frame"><Wordmark/><AccountMenu name={profile.name || profile.email} email={profile.email} image={profile.image}/></header>
    <main className="frame"><p className="eyebrow">DevCollab workspace</p><h1>Your workspace starts here.</h1>
    <section className="workspace-empty"><Folder size={30}/><h2>Organization setup</h2><p>Your DevCollab account is ready. Organization and project setup will be available in the next development milestone.</p></section></main>
  </div></WorkspaceThemeProvider>;
}
