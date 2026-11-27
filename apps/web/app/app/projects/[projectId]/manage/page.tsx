import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ProjectManagementDashboardDto } from "@devcollab/shared";
import { AccessRestricted } from "@/components/workspace/access-restricted";
import { ProjectManagementPanel } from "@/components/workspace/project-management-panel";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectManagePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [ctx, { projectId }] = await Promise.all([getWorkspaceBootstrap(), params]);
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or select an organization to access project management.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const res = await apiUserFetch<ProjectManagementDashboardDto>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/management`,
  );

  if (!res.ok) {
    if (res.status === 403) {
      return (
        <AccessRestricted
          title="Project management restricted"
          description="Only organization Owners, Admins, and assigned Project Managers for this project can access its management dashboard."
          backHref={`/app/projects/${encodeURIComponent(projectId)}`}
          backLabel="Open developer view"
        />
      );
    }

    return (
      <section className="empty-panel" role="alert">
        <h2>Project management unavailable</h2>
        <p>{res.message}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app/projects">
            <ArrowLeft size={14} /> Back to projects
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <ProjectManagementPanel
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      data={res.data}
    />
  );
}
