"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, CircleAlert, FolderGit2, ListTodo } from "lucide-react";
import type { MyTasksResponseDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { PersonalInsightsView } from "./analytics/personal-insights-view";
import { DueDateChip, TaskPriorityBadge, TaskStatusBadge } from "./task-badges";

type FilterMode = "active" | "dueSoon" | "overdue" | "completed" | "all";
type ScopeMode = "org" | "all";
type ViewMode = "tasks" | "insights";

export function MyTasksPanel({
  orgName,
  initialData,
  initialView = "tasks",
}: {
  orgName: string | null;
  initialData: MyTasksResponseDto;
  initialView?: ViewMode;
}) {
  const [view, setView] = useState<ViewMode>(initialView);
  const [data, setData] = useState<MyTasksResponseDto>(initialData);
  const [filter, setFilter] = useState<FilterMode>("active");
  const [scope, setScope] = useState<ScopeMode>(orgName ? "org" : "all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh(nextScope: ScopeMode, nextFilter: FilterMode) {
    setScope(nextScope);
    setFilter(nextFilter);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/tasks/mine?scope=${encodeURIComponent(nextScope)}&filter=${encodeURIComponent(nextFilter)}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(body?.message ?? "Failed to load your assigned tasks.");
        return;
      }
      setData(body as MyTasksResponseDto);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const tabs: Array<{ key: FilterMode; label: string; count: number }> = [
    { key: "active", label: "Active", count: data.counts.active },
    { key: "dueSoon", label: "Due soon", count: data.counts.dueSoon },
    { key: "overdue", label: "Overdue", count: data.counts.overdue },
    { key: "completed", label: "Completed", count: data.counts.completed },
    { key: "all", label: "All", count: data.counts.all },
  ];

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> Personal workload
          </p>
          <h1>My Tasks</h1>
          <p className="page-subtitle">
            Tasks assigned to you across projects you are authorized to access.
          </p>
          <div className="inline-actions" role="tablist" aria-label="My Tasks view mode" style={{ marginTop: ".75rem" }}>
            <Button
              type="button"
              size="compact"
              variant={view === "tasks" ? "primary" : "secondary"}
              onClick={() => setView("tasks")}
            >
              <ListTodo size={14} /> Assigned Tasks
            </Button>
            <Button
              type="button"
              size="compact"
              variant={view === "insights" ? "primary" : "secondary"}
              onClick={() => setView("insights")}
            >
              <BarChart3 size={14} /> Personal Insights
            </Button>
          </div>
        </div>

        {orgName && (
          <div className="inline-actions" role="group" aria-label="Organization scope">
            <Button
              type="button"
              size="compact"
              variant={scope === "org" ? "primary" : "secondary"}
              disabled={loading}
              onClick={() => refresh("org", filter)}
            >
              {orgName}
            </Button>
            <Button
              type="button"
              size="compact"
              variant={scope === "all" ? "primary" : "secondary"}
              disabled={loading}
              onClick={() => refresh("all", filter)}
            >
              All my organizations
            </Button>
          </div>
        )}
      </header>

      {view === "insights" ? (
        <PersonalInsightsView />
      ) : (
        <>
          <div className="inline-actions" role="tablist" aria-label="Task filter">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="compact"
            variant={filter === tab.key ? "primary" : "secondary"}
            disabled={loading}
            onClick={() => refresh(scope, tab.key)}
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </Button>
        ))}
      </div>

      {error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {error}
          </span>
        </p>
      )}

      {data.items.length === 0 ? (
        <section className="empty-panel">
          {filter === "completed" ? <CheckCircle2 size={26} /> : <ListTodo size={26} />}
          <h2>
            {data.counts.all === 0
              ? "No tasks assigned to you yet"
              : `No ${filter === "dueSoon" ? "due-soon" : filter} tasks right now`}
          </h2>
          <p>
            {data.counts.all === 0
              ? "Open a project board to create tasks or ask a teammate to assign work to you."
              : "Switch tabs above or browse your organization’s projects to see more work."}
          </p>
          <Button asChild size="compact" variant="secondary">
            <Link href="/app/projects">
              <FolderGit2 size={14} /> Browse projects
            </Link>
          </Button>
        </section>
      ) : (
        <section className="app-card" aria-busy={loading}>
          <div className="data-table-wrap task-table-desktop">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <Link
                        href={`/app/projects/${task.projectId}/tasks/${task.id}`}
                        className="task-link-row"
                      >
                        <span className="project-key">{task.identifier}</span>
                        <strong>{task.title}</strong>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/app/projects/${task.projectId}/tasks`} className="field-hint">
                        {task.projectName}
                        {scope === "all" ? ` · ${task.organizationName}` : ""}
                      </Link>
                    </td>
                    <td>
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td>
                      <TaskPriorityBadge priority={task.priority} />
                    </td>
                    <td>
                      {task.dueDate ? (
                        <DueDateChip dueDate={task.dueDate} status={task.status} />
                      ) : (
                        <span className="field-hint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="task-cards-mobile">
            {data.items.map((task) => (
              <Link
                key={task.id}
                href={`/app/projects/${task.projectId}/tasks/${task.id}`}
                className="task-mobile-card"
              >
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <span className="project-key">{task.identifier}</span>
                  <TaskPriorityBadge priority={task.priority} />
                </div>
                <strong>{task.title}</strong>
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <span className="field-hint">{task.projectName}</span>
                  <TaskStatusBadge status={task.status} />
                </div>
                <DueDateChip dueDate={task.dueDate} status={task.status} />
              </Link>
            ))}
          </div>
        </section>
      )}
        </>
      )}
    </>
  );
}
