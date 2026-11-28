import Link from "next/link";
import type { ProjectAnalyticsDto } from "@devcollab/shared";
import { apiUserFetch } from "@/lib/server/backend";
import { loadWithActiveOrg } from "@/lib/server/dal";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import { ProjectAnalyticsView } from "@/components/workspace/analytics/project-analytics-view";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ProjectAnalyticsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { ctx, data: res } = await loadWithActiveOrg((userId, orgId) =>
    apiUserFetch<ProjectAnalyticsDto>(
      userId,
      `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/analytics?preset=30d&timezone=UTC`,
    ),
  );
  if (!ctx) return null;
  const { bootstrap } = ctx;

  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg || !res) {
    return (
      <section className="empty-panel">
        <h1>No active organization</h1>
        <Button asChild size="compact">
          <Link href="/app">Return to workspace</Link>
        </Button>
      </section>
    );
  }

  if (!res.ok) {
    return (
      <section className="empty-panel">
        <h1>Project Analytics Unavailable</h1>
        <p>{res.message}</p>
        <Button asChild size="compact" variant="secondary">
          <Link href="/app/projects">Back to projects</Link>
        </Button>
      </section>
    );
  }

  const { project } = res.data;

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <div className="page-head">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span> · Project Analytics
          </p>
          <h1>{project.name}</h1>
        </div>
      </div>

      <ProjectSubnav
        projectId={project.id}
        active="analytics"
        canManageProject={project.canManageProject}
      />

      <ProjectAnalyticsView initialData={res.data} />
    </div>
  );
}
