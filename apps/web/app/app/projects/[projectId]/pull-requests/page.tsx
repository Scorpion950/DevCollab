import Link from "next/link";
import { ArrowLeft, GitPullRequest } from "lucide-react";
import type { ProjectDetailDto, PullRequestsListResponseDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { PullRequestsListPanel } from "@/components/workspace/pull-requests-list-panel";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectPullRequestsPage({
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
        <p>Create or select an organization first.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const [projRes, prsRes] = await Promise.all([
    apiUserFetch<ProjectDetailDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}`,
    ),
    apiUserFetch<PullRequestsListResponseDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/github/pull-requests?state=OPEN&limit=20`,
    ),
  ]);

  if (!projRes.ok || !prsRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <GitPullRequest size={26} />
        <h2>Pull requests unavailable in {activeOrg.name}</h2>
        <p>{(!projRes.ok && projRes.message) || (!prsRes.ok && prsRes.message)}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app/projects">
            <ArrowLeft size={14} /> Back to projects
          </Link>
        </Button>
      </section>
    );
  }

  return <PullRequestsListPanel project={projRes.data} initialData={prsRes.data} />;
}
