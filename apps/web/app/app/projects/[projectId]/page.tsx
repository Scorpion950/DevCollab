import Link from "next/link";
import { ArrowLeft, Columns3, FolderGit2, Layers3, List, ShieldCheck, UsersRound } from "lucide-react";
import type { ProjectDetailDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import {
  DueDateChip,
  TaskPriorityBadge,
  TaskStatusBadge,
  UserAvatar,
} from "@/components/workspace/task-badges";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectDetailPage({
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
        <p>Select or create an organization first to view projects.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const res = await apiUserFetch<ProjectDetailDto>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}`,
  );

  if (!res.ok) {
    return (
      <section className="empty-panel" role="alert">
        <FolderGit2 size={26} />
        <h2>Project unavailable in {activeOrg.name}</h2>
        <p>{res.message}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app/projects">
            <ArrowLeft size={14} /> Back to projects
          </Link>
        </Button>
      </section>
    );
  }

  const project = res.data;
  const developers = project.members.filter((m) => m.role === "DEVELOPER");
  const summary = project.taskSummary;
  const recentTasks = project.recentTasks ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span className={`badge ${project.status === "ACTIVE" ? "badge-accent" : "badge-warm"}`}>
              {project.status}
            </span>
            <span>{activeOrg.name}</span>
          </p>
          <h1>{project.name}</h1>
          <p className="page-subtitle">
            {project.description || "No project description has been added yet."}
          </p>
          <ProjectSubnav
            projectId={project.id}
            active="overview"
            canManageProject={project.canManageProject}
          />
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href="/app/projects">
              <ArrowLeft size={14} /> All projects
            </Link>
          </Button>
          <Button asChild size="compact">
            <Link href={`/app/projects/${project.id}/tasks`}>
              <Columns3 size={15} /> Open Board
            </Link>
          </Button>
          {project.canManageProject && (
            <Button asChild variant="secondary" size="compact">
              <Link href={`/app/projects/${project.id}/manage`}>
                <ShieldCheck size={15} /> Management
              </Link>
            </Button>
          )}
        </div>
      </header>

      {project.status === "ARCHIVED" && (
        <p className="banner banner-neutral" role="status">
          This project is archived. Active development changes are paused until restored by an
          organization Owner or Admin.
        </p>
      )}

      {summary && (
        <dl className="stat-grid" aria-label="Project task summary">
          <div className="stat-card">
            <dt>Active tasks</dt>
            <dd>{summary.totalActive}</dd>
          </div>
          <div className="stat-card">
            <dt>In progress</dt>
            <dd>{summary.inProgress}</dd>
          </div>
          <div className="stat-card">
            <dt>In review</dt>
            <dd>{summary.inReview}</dd>
          </div>
          <div className="stat-card">
            <dt>Completed</dt>
            <dd>{summary.done}</dd>
          </div>
        </dl>
      )}

      <div className="panel-grid">
        <div className="form-stack">
          <section className="app-card" aria-labelledby="project-recent-tasks-heading">
            <div className="app-card-header">
              <h2 id="project-recent-tasks-heading">Recently updated tasks</h2>
              <div className="inline-actions">
                <Link href={`/app/projects/${project.id}/tasks`} className="badge">
                  <Columns3 size={12} /> Board
                </Link>
                <Link href={`/app/projects/${project.id}/tasks?view=list`} className="badge">
                  <List size={12} /> List
                </Link>
              </div>
            </div>

            {recentTasks.length === 0 ? (
              <div className="empty-panel">
                <h3>No active tasks yet</h3>
                <p>Open the project board to create and track tasks with your team.</p>
                <Button asChild size="compact">
                  <Link href={`/app/projects/${project.id}/tasks`}>Go to Kanban board</Link>
                </Button>
              </div>
            ) : (
              <div className="form-stack" style={{ gap: ".65rem" }}>
                {recentTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/app/projects/${project.id}/tasks/${task.id}`}
                    className="overview-task-row"
                  >
                    <div className="inline-actions" style={{ gap: ".55rem", minWidth: 0 }}>
                      <span className="project-key">{task.identifier}</span>
                      <strong className="truncate-text">{task.title}</strong>
                    </div>
                    <div className="inline-actions" style={{ gap: ".45rem" }}>
                      <TaskStatusBadge status={task.status} />
                      <TaskPriorityBadge priority={task.priority} />
                      <DueDateChip dueDate={task.dueDate} status={task.status} />
                      <UserAvatar user={task.assignee} size="sm" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="app-card" aria-labelledby="project-overview-heading">
            <div className="app-card-header">
              <h2 id="project-overview-heading">Project workspace</h2>
              <span className="badge">Created {formatDate(project.createdAt)}</span>
            </div>

            <div className="empty-panel">
              <Layers3 size={24} />
              <h3>Upcoming engineering integrations</h3>
              <p>
                GitHub repository sync, cloud development environments, and autonomous AI agent
                reviews will connect directly to these project tasks in future milestones.
              </p>
            </div>
          </section>
        </div>

        <section className="app-card" aria-labelledby="project-team-heading">
          <div className="app-card-header">
            <h2 id="project-team-heading">Project roles</h2>
            <UsersRound size={17} />
          </div>

          <div className="form-stack">
            <div>
              <p className="sidebar-heading" style={{ paddingLeft: 0 }}>
                Project Managers
              </p>
              {project.projectManagers.length === 0 ? (
                <p className="field-hint">Managed by organization Owners and Admins.</p>
              ) : (
                <div className="form-stack" style={{ gap: ".6rem", marginTop: ".45rem" }}>
                  {project.projectManagers.map((pm) => (
                    <div
                      key={pm.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: ".5rem",
                      }}
                    >
                      <div className="member-cell">
                        <span className="avatar">
                          {(pm.name || pm.email).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="member-cell-text">
                          <strong>{pm.name || pm.email}</strong>
                          <small>{pm.email}</small>
                        </div>
                      </div>
                      <span className="badge badge-accent">PM</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ paddingTop: ".85rem", borderTop: "1px solid var(--border)" }}>
              <p className="sidebar-heading" style={{ paddingLeft: 0 }}>
                Assigned Developers
              </p>
              {developers.length === 0 ? (
                <p className="field-hint" style={{ marginTop: ".35rem" }}>
                  All active organization members can collaborate on this project. No individual
                  developer assignments added yet.
                </p>
              ) : (
                <div className="form-stack" style={{ gap: ".6rem", marginTop: ".45rem" }}>
                  {developers.map((dev) => (
                    <div
                      key={dev.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: ".5rem",
                      }}
                    >
                      <div className="member-cell">
                        <span className="avatar">
                          {(dev.name || dev.email).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="member-cell-text">
                          <strong>{dev.name || dev.email}</strong>
                          <small>{dev.email}</small>
                        </div>
                      </div>
                      <span className="badge badge-sage">Developer</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
