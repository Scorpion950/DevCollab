"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { ProjectManagementDashboardDto, ProjectRole } from "@devcollab/shared";
import {
  assignProjectRoleAction,
  removeProjectRoleAction,
  setProjectArchiveAction,
  updateProjectAction,
  type ActionState,
} from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { ProjectSubnav } from "./project-subnav";
import { formatDateTime } from "./task-badges";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectManagementPanel({
  orgId,
  orgName,
  data,
}: {
  orgId: string;
  orgName: string;
  data: ProjectManagementDashboardDto;
}) {
  const {
    project,
    canArchiveOrRestore,
    canAssignProjectManager,
    canAssignDeveloper,
    orgMembers,
    recentActivity,
    taskSummary,
    recentTaskActivity,
  } = data;

  const [editState, editAction, editPending] = useActionState<ActionState, FormData>(
    updateProjectAction,
    {},
  );
  const [feedback, setFeedback] = useState<ActionState | null>(null);
  const [selectedUserId, setSelectedUserId] = useState(orgMembers[0]?.userId ?? "");
  const [selectedRole, setSelectedRole] = useState<ProjectRole>(
    canAssignProjectManager ? "PROJECT_MANAGER" : "DEVELOPER",
  );
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<ActionState>;
  } | null>(null);
  const [busy, startTransition] = useTransition();

  function runConfirmedAction() {
    if (!confirmState) return;
    const action = confirmState.run;
    startTransition(async () => {
      const res = await action();
      setFeedback(res);
      setConfirmState(null);
    });
  }

  function handleAssignRole(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedUserId) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await assignProjectRoleAction(orgId, project.id, selectedUserId, selectedRole);
      setFeedback(res);
    });
  }

  const activeMessage = feedback ?? editState;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <ShieldCheck size={14} /> Project management ·{" "}
            <span className="project-key">{project.key}</span>
            <span className={`badge ${project.status === "ACTIVE" ? "badge-accent" : "badge-warm"}`}>
              {project.status}
            </span>
          </p>
          <h1>{project.name}</h1>
          <p className="page-subtitle">
            {orgName} · Created {formatDate(project.createdAt)}
            {project.createdBy
              ? ` by ${project.createdBy.name || project.createdBy.email}`
              : ""}
          </p>
          <ProjectSubnav
            projectId={project.id}
            active="manage"
            canManageProject
          />
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href={`/app/projects/${project.id}`}>
              <ArrowLeft size={14} /> Developer view
            </Link>
          </Button>
          {canArchiveOrRestore && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              disabled={busy}
              onClick={() =>
                setConfirmState({
                  title:
                    project.status === "ACTIVE"
                      ? `Archive ${project.name}?`
                      : `Restore ${project.name}?`,
                  description:
                    project.status === "ACTIVE"
                      ? "Archiving marks this project read-only until restored by an Owner or Admin."
                      : "Restoring returns this project to active workspace status.",
                  confirmLabel:
                    project.status === "ACTIVE" ? "Archive project" : "Restore project",
                  danger: project.status === "ACTIVE",
                  run: () =>
                    setProjectArchiveAction(orgId, project.id, project.status === "ACTIVE"),
                })
              }
            >
              {project.status === "ACTIVE" ? (
                <>
                  <Archive size={14} /> Archive project
                </>
              ) : (
                <>
                  <ArchiveRestore size={14} /> Restore project
                </>
              )}
            </Button>
          )}
        </div>
      </header>

      {activeMessage?.error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {activeMessage.error}
          </span>
        </p>
      )}
      {activeMessage?.success && (
        <p className="banner banner-success" role="status">
          <span className="inline-actions">
            <CircleCheck size={16} />
            {activeMessage.success}
          </span>
        </p>
      )}

      <div className="panel-grid">
        <div className="form-stack">
          <section className="app-card" aria-labelledby="project-settings-heading">
            <div className="app-card-header">
              <h2 id="project-settings-heading">Project configuration</h2>
            </div>

            <form action={editAction} className="form-stack" aria-busy={editPending}>
              <input type="hidden" name="orgId" value={orgId} />
              <input type="hidden" name="projectId" value={project.id} />

              <div className="field-grid">
                <label className="field-group">
                  Project name
                  <input
                    type="text"
                    name="name"
                    className="field-input"
                    required
                    minLength={2}
                    maxLength={100}
                    defaultValue={project.name}
                  />
                </label>

                <label className="field-group">
                  Project key
                  <input
                    type="text"
                    name="key"
                    className="field-input mono-input"
                    required
                    minLength={2}
                    maxLength={10}
                    defaultValue={project.key}
                    readOnly={!canAssignProjectManager}
                    aria-describedby={!canAssignProjectManager ? "key-lock-note" : undefined}
                  />
                  {!canAssignProjectManager && (
                    <span id="key-lock-note" className="field-hint">
                      Only organization Owners or Admins can rename project keys.
                    </span>
                  )}
                </label>
              </div>

              <label className="field-group">
                Description
                <textarea
                  name="description"
                  className="field-textarea"
                  maxLength={1000}
                  defaultValue={project.description ?? ""}
                />
              </label>

              <div>
                <Button type="submit" size="compact" disabled={editPending}>
                  {editPending ? "Saving…" : "Save Changes"}
                </Button>
              </div>
            </form>
          </section>

          <section className="app-card" aria-labelledby="project-roles-heading">
            <div className="app-card-header">
              <h2 id="project-roles-heading">Project-level role assignments</h2>
              <span className="badge">{project.members.length} assigned</span>
            </div>

            {canAssignDeveloper && (
              <form
                onSubmit={handleAssignRole}
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: ".65rem",
                  alignItems: "flex-end",
                  marginBottom: "1.25rem",
                  paddingBottom: "1.25rem",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <label className="field-group" style={{ flex: "1 1 13rem" }}>
                  Organization member
                  <select
                    className="field-select"
                    value={selectedUserId}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                  >
                    {orgMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.name || member.email} ({member.role.toLowerCase()})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group" style={{ flex: "0 1 12rem" }}>
                  Project role
                  <select
                    className="field-select"
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as ProjectRole)}
                  >
                    {canAssignProjectManager && (
                      <option value="PROJECT_MANAGER">Project Manager</option>
                    )}
                    <option value="DEVELOPER">Developer</option>
                  </select>
                </label>

                <Button type="submit" size="compact" disabled={busy || !selectedUserId}>
                  <UserPlus size={14} /> Assign role
                </Button>
              </form>
            )}

            {project.members.length === 0 ? (
              <p className="field-hint">
                No explicit project role assignments yet. Assign a Project Manager or Developer above.
              </p>
            ) : (
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Project role</th>
                      <th>Assigned</th>
                      <th style={{ textAlign: "right" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {project.members.map((person) => {
                      const canRemove =
                        canAssignProjectManager ||
                        (canAssignDeveloper && person.role === "DEVELOPER");
                      return (
                        <tr key={person.userId}>
                          <td>
                            <div className="member-cell">
                              <span className="avatar">
                                {(person.name || person.email).slice(0, 1).toUpperCase()}
                              </span>
                              <div className="member-cell-text">
                                <strong>{person.name || person.email}</strong>
                                <small>{person.email}</small>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                person.role === "PROJECT_MANAGER" ? "badge-accent" : "badge-sage"
                              }`}
                            >
                              {person.role === "PROJECT_MANAGER" ? "Project Manager" : "Developer"}
                            </span>
                          </td>
                          <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                            {formatDate(person.assignedAt)}
                          </td>
                          <td style={{ textAlign: "right" }}>
                            {canRemove && (
                              <button
                                type="button"
                                className="btn-danger-ghost"
                                disabled={busy}
                                onClick={() =>
                                  setConfirmState({
                                    title: "Remove project role?",
                                    description: `Remove ${person.name || person.email}’s ${
                                      person.role === "PROJECT_MANAGER"
                                        ? "Project Manager"
                                        : "Developer"
                                    } assignment from ${project.name}?`,
                                    confirmLabel: "Remove assignment",
                                    danger: true,
                                    run: () =>
                                      removeProjectRoleAction(orgId, project.id, person.userId),
                                  })
                                }
                              >
                                <Trash2 size={13} /> Remove
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="form-stack">
          <section className="app-card" aria-labelledby="planned-telemetry-heading">
            <div className="app-card-header">
              <h2 id="planned-telemetry-heading">Task delivery metrics</h2>
              <Link href={`/app/projects/${project.id}/tasks`} className="badge">
                Open board
              </Link>
            </div>
            <dl className="stat-grid" style={{ marginBottom: "1rem" }}>
              <div className="stat-card">
                <dt>Active tasks</dt>
                <dd>{taskSummary.totalActive}</dd>
              </div>
              <div className="stat-card">
                <dt>Completed</dt>
                <dd>{taskSummary.done}</dd>
              </div>
              <div className="stat-card">
                <dt>In review</dt>
                <dd>{taskSummary.inReview}</dd>
              </div>
              <div className="stat-card">
                <dt>Overdue</dt>
                <dd style={{ color: taskSummary.overdue > 0 ? "var(--warm-ink)" : undefined }}>
                  {taskSummary.overdue}
                </dd>
              </div>
              <div className="stat-card">
                <dt>Unassigned</dt>
                <dd>{taskSummary.unassigned}</dd>
              </div>
              <div className="stat-card">
                <dt>Archived tasks</dt>
                <dd>{taskSummary.archived}</dd>
              </div>
            </dl>

            <div className="inline-actions" style={{ gap: ".45rem", marginBottom: "1rem" }}>
              <span className="badge priority-urgent">Urgent: {taskSummary.priorityBreakdown.URGENT}</span>
              <span className="badge priority-high">High: {taskSummary.priorityBreakdown.HIGH}</span>
              <span className="badge">Medium: {taskSummary.priorityBreakdown.MEDIUM}</span>
              <span className="badge priority-low">Low: {taskSummary.priorityBreakdown.LOW}</span>
            </div>

            <div className="banner banner-neutral" style={{ fontSize: ".83rem" }}>
              Pull request activity, test runs, AI agent executions, and AI spend remain upcoming
              milestones.
            </div>
          </section>

          <section className="app-card" aria-labelledby="project-task-activity-heading">
            <div className="app-card-header">
              <h2 id="project-task-activity-heading">Recent task activity</h2>
            </div>
            {recentTaskActivity.length === 0 ? (
              <p className="field-hint">No task activity recorded yet.</p>
            ) : (
              <ul className="activity-list">
                {recentTaskActivity.map((entry) => (
                  <li key={entry.id} className="activity-item">
                    <p>{entry.summary}</p>
                    <small>{formatDateTime(entry.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="app-card" aria-labelledby="project-activity-heading">
            <div className="app-card-header">
              <h2 id="project-activity-heading">Project audit log</h2>
            </div>
            {recentActivity.length === 0 ? (
              <p className="field-hint">No project events recorded yet.</p>
            ) : (
              <ul className="activity-list">
                {recentActivity.map((entry) => (
                  <li key={entry.id} className="activity-item">
                    <p>{entry.summary}</p>
                    <small>
                      {entry.actor?.name || entry.actor?.email || "System"} ·{" "}
                      {formatDate(entry.createdAt)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        busy={busy}
        onConfirm={runConfirmedAction}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}
