import Link from "next/link";
import { ArrowLeft, GitPullRequest } from "lucide-react";
import type {
  ProjectDetailDto,
  ProjectTasksListResponseDto,
  PullRequestDetailDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { PullRequestDetailPanel } from "@/components/workspace/pull-request-detail-panel";
import { apiUserFetch } from "@/lib/server/backend";
import { loadWithActiveOrg } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function PullRequestDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; prNumber: string }>;
}) {
  const { projectId, prNumber } = await params;
  const { ctx, data: results } = await loadWithActiveOrg((userId, orgId) =>
    Promise.all([
      apiUserFetch<ProjectDetailDto>(
        userId,
        `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`,
      ),
      apiUserFetch<PullRequestDetailDto>(
        userId,
        `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/github/pull-requests/${encodeURIComponent(prNumber)}`,
      ),
      apiUserFetch<ProjectTasksListResponseDto>(
        userId,
        `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/tasks?limit=100`,
      ),
    ]),
  );
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg || !results) {
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

  const [projRes, prRes, tasksRes] = results;

  if (!projRes.ok || !prRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <GitPullRequest size={26} />
        <h2>Pull request unavailable</h2>
        <p>{(!projRes.ok && projRes.message) || (!prRes.ok && prRes.message)}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(projectId)}/pull-requests`}>
            <ArrowLeft size={14} /> Back to pull requests
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <PullRequestDetailPanel
      projectId={projRes.data.id}
      projectKey={projRes.data.key}
      projectName={projRes.data.name}
      initialDetail={prRes.data}
      projectTasks={tasksRes.ok ? tasksRes.data.items : []}
    />
  );
}
