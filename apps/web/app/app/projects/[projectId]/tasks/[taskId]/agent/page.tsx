import Link from "next/link";
import { ArrowLeft, Bot } from "lucide-react";
import type { TaskAgentWorkspaceDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import { TaskAgentWorkspace } from "@/components/workspace/task-agent-workspace";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function TaskAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
  searchParams: Promise<{ runId?: string }>;
}) {
  const [ctx, { projectId, taskId }, { runId }] = await Promise.all([
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
        <p>Create or select an organization to open the AI workspace.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const qs = runId ? `?runId=${encodeURIComponent(runId)}` : "";
  const [wsRes, projRes] = await Promise.all([
    apiUserFetch<TaskAgentWorkspaceDto>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}/ai-runs${qs}`,
    ),
    apiUserFetch<{ canManageProject: boolean }>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}`,
    ),
  ]);

  if (!wsRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <Bot size={26} />
        <h2>AI Workspace unavailable</h2>
        <p>{wsRes.message}</p>
        <Button asChild variant="secondary" size="compact">
          <Link
            href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`}
          >
            <ArrowLeft size={14} /> Back to task
          </Link>
        </Button>
      </section>
    );
  }

  const canManageProject = projRes.ok ? projRes.data.canManageProject : wsRes.data.task.canArchiveTask;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{wsRes.data.task.projectKey}</span>
            <span>{wsRes.data.task.projectName} · AI Coding Agent Workspace</span>
          </p>
          <h1>
            {wsRes.data.task.identifier}: {wsRes.data.task.title}
          </h1>
          <ProjectSubnav
            projectId={projectId}
            active="ai"
            canManageProject={canManageProject}
          />
        </div>

        <Button asChild variant="secondary" size="compact">
          <Link
            href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`}
          >
            <ArrowLeft size={14} /> Back to task
          </Link>
        </Button>
      </header>

      <TaskAgentWorkspace projectId={projectId} initialWorkspace={wsRes.data} />
    </>
  );
}
