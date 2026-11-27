import Link from "next/link";
import { ArrowLeft, FolderGit2 } from "lucide-react";
import type { ProjectDetailDto, ProjectRepositoryOverviewDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { RepositoryOverviewPanel } from "@/components/workspace/repository-overview-panel";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectRepositoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ installationId?: string; setup?: string }>;
}) {
  const [ctx, { projectId }, { installationId, setup }] = await Promise.all([
    getWorkspaceBootstrap(),
    params,
    searchParams,
  ]);
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or select an organization first.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const [projRes, repoRes] = await Promise.all([
    apiUserFetch<ProjectDetailDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}`,
    ),
    apiUserFetch<ProjectRepositoryOverviewDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/github/repository`,
    ),
  ]);

  if (!projRes.ok || !repoRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <FolderGit2 size={26} />
        <h2>Repository view unavailable in {activeOrg.name}</h2>
        <p>{(!projRes.ok && projRes.message) || (!repoRes.ok && repoRes.message)}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app/projects">
            <ArrowLeft size={14} /> Back to projects
          </Link>
        </Button>
      </section>
    );
  }

  const setupNotice = setup === "select" || setup === "cancelled" ? setup : null;

  return (
    <RepositoryOverviewPanel
      project={projRes.data}
      initialOverview={repoRes.data}
      initialInstallationId={installationId ?? null}
      setupNotice={setupNotice}
    />
  );
}
