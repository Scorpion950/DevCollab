import type { ReactNode } from "react";
import { AppShell } from "@/components/workspace/app-shell";
import { ProfileUnavailable } from "@/components/profile-unavailable";
import { WorkspaceSession } from "@/components/workspace-session";
import { WorkspaceThemeProvider } from "@/components/workspace-theme/workspace-theme";
import { getWorkspaceBootstrap, getWorkspaceTheme } from "@/lib/server/dal";
import "../workspace.css";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const [ctx, theme] = await Promise.all([getWorkspaceBootstrap(), getWorkspaceTheme()]);

  if (!ctx) {
    return (
      <WorkspaceThemeProvider initialTheme={theme}>
        <ProfileUnavailable />
      </WorkspaceThemeProvider>
    );
  }

  const { session, bootstrap } = ctx;

  return (
    <WorkspaceSession session={session}>
      <WorkspaceThemeProvider initialTheme={theme}>
        <AppShell
          user={bootstrap.user}
          organizations={bootstrap.organizations}
          activeOrganization={bootstrap.activeOrganization}
          managedProjects={bootstrap.managedProjects}
        >
          {children}
        </AppShell>
      </WorkspaceThemeProvider>
    </WorkspaceSession>
  );
}
