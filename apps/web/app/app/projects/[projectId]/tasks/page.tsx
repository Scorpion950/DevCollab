import Link from "next/link";
import { ArrowLeft, FolderGit2 } from "lucide-react";
import type { ProjectTasksListResponseDto } from "@devcollab/shared";
import { ProjectTasksWorkspace } from "@/components/workspace/project-tasks-workspace";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { loadWithActiveOrg } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string; task?: string }>;
}) {
  const [{ projectId }, { view, task }] = await Promise.all([params, searchParams]);
  const { ctx, data: res } = await loadWithActiveOrg((userId, orgId) =>
    apiUserFetch<ProjectTasksListResponseDto>(
      userId,
      `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/tasks`,
    ),
  );
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg || !res) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Select or create an organization first to access project tasks.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  if (!res.ok) {
    return (
      <section className="empty-panel" role="alert">
        <FolderGit2 size={26} />
        <h2>Project tasks unavailable in {activeOrg.name}</h2>
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
    <ProjectTasksWorkspace
      initialData={res.data}
      initialView={view === "list" ? "list" : "board"}
      currentUserId={bootstrap.user.id}
      initialTaskId={task ?? null}
    />
  );
}
