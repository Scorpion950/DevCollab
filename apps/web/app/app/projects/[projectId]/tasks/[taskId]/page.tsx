import Link from "next/link";
import { ArrowLeft, ListTodo } from "lucide-react";
import type { OrganizationMemberDto, TaskDetailDto } from "@devcollab/shared";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import { TaskDetailView } from "@/components/workspace/task-detail-view";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const [ctx, { projectId, taskId }] = await Promise.all([getWorkspaceBootstrap(), params]);
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or select an organization to view this task.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const [taskRes, projectListRes] = await Promise.all([
    apiUserFetch<TaskDetailDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`,
    ),
    apiUserFetch<{ project: { canManageProject: boolean }; orgMembers: OrganizationMemberDto[] }>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/tasks?limit=1`,
    ),
  ]);

  if (!taskRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <ListTodo size={26} />
        <h2>Task unavailable in {activeOrg.name}</h2>
        <p>{taskRes.message}</p>
        <div className="inline-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href={`/app/projects/${encodeURIComponent(projectId)}/tasks`}>
              <ArrowLeft size={14} /> Project board
            </Link>
          </Button>
          <Button asChild variant="secondary" size="compact">
            <Link href="/app/tasks">My Tasks</Link>
          </Button>
        </div>
      </section>
    );
  }

  const canManageProject =
    projectListRes.ok ? projectListRes.data.project.canManageProject : taskRes.data.canArchiveTask;
  const orgMembers = projectListRes.ok ? projectListRes.data.orgMembers : [];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{taskRes.data.projectKey}</span>
            <span>{taskRes.data.projectName}</span>
          </p>
          <ProjectSubnav
            projectId={projectId}
            active="board"
            canManageProject={canManageProject}
          />
        </div>

        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(projectId)}/tasks`}>
            <ArrowLeft size={14} /> Back to board
          </Link>
        </Button>
      </header>

      <TaskDetailView
        projectId={projectId}
        initialTask={taskRes.data}
        orgMembers={orgMembers}
      />
    </>
  );
}
