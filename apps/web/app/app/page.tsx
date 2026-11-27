import Link from "next/link";
import { MailPlus } from "lucide-react";
import type { OrganizationDashboardDto, ProjectSummaryDto } from "@devcollab/shared";
import { CreateOrganizationForm } from "@/components/workspace/create-org-form";
import { DeveloperWorkspace } from "@/components/workspace/developer-workspace";
import { OrganizationDashboard } from "@/components/workspace/org-dashboard";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function WorkspaceHomePage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;

  if (!activeOrg) {
    return (
      <div className="onboarding-shell">
        <header className="page-header">
          <div>
            <p className="eyebrow">
              <span className="index-mark" /> First-time setup
            </p>
            <h1>Welcome, {bootstrap.user.name || bootstrap.user.email}.</h1>
            <p className="page-subtitle">
              Create your first organization to start managing teams and projects, or open an
              invitation link shared by your team.
            </p>
          </div>
        </header>

        <CreateOrganizationForm
          heading="Create your first organization"
          subheading="You will start as the Organization Owner and can invite teammates afterward."
        />

        <section className="banner banner-neutral">
          <span className="inline-actions">
            <MailPlus size={16} />
            Have an invitation link from an existing team? Open the link in your browser to join.
          </span>
          <Link href="/app/profile" style={{ color: "var(--accent-ink)", fontWeight: 600 }}>
            View profile
          </Link>
        </section>
      </div>
    );
  }

  if (activeOrg.role === "OWNER" || activeOrg.role === "ADMIN") {
    const dashboardRes = await apiUserFetch<OrganizationDashboardDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/dashboard`,
    );

    if (!dashboardRes.ok) {
      return (
        <section className="banner banner-error" role="alert">
          {dashboardRes.message}
        </section>
      );
    }

    return <OrganizationDashboard data={dashboardRes.data} />;
  }

  const projectsRes = await apiUserFetch<ProjectSummaryDto[]>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/projects`,
  );

  if (!projectsRes.ok) {
    return (
      <section className="banner banner-error" role="alert">
        {projectsRes.message}
      </section>
    );
  }

  return (
    <DeveloperWorkspace
      user={bootstrap.user}
      organization={activeOrg}
      projects={projectsRes.data}
    />
  );
}
