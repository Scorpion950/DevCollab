"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  CircleAlert,
  Code2,
  Copy,
  ExternalLink,
  GitPullRequest,
  History,
  Link2,
  MessageSquare,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Unlink,
  X,
} from "lucide-react";
import type {
  OrganizationMemberDto,
  PullRequestSummaryDto,
  PullRequestsListResponseDto,
  TaskCommentDto,
  TaskDetailDto,
  TaskPriority,
  TaskStatus,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { AgentRunStatusBadge, formatUsd } from "./ai-badges";
import { ConfirmDialog } from "./confirm-dialog";
import { PullRequestStateBadge } from "./github-badges";
import {
  formatDateTime,
  formatShortDate,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TaskPriorityBadge,
  TaskStatusBadge,
  UserAvatar,
} from "./task-badges";

export function TaskDetailView({
  projectId,
  initialTask,
  orgMembers,
  onTaskUpdated,
  onCloseDrawer,
  inDrawer = false,
  onDirtyChange,
}: {
  projectId: string;
  initialTask: TaskDetailDto;
  orgMembers: OrganizationMemberDto[];
  onTaskUpdated?: (task: TaskDetailDto) => void;
  onCloseDrawer?: () => void;
  inDrawer?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [task, setTask] = useState<TaskDetailDto>(initialTask);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initialTask.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(initialTask.description ?? "");
  const [labelsInput, setLabelsInput] = useState(initialTask.labels.join(", "));
  const [editingLabels, setEditingLabels] = useState(false);

  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [deleteCommentTarget, setDeleteCommentTarget] = useState<TaskCommentDto | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<"archive" | "restore" | null>(null);

  const [savingField, setSavingField] = useState(false);
  const [commentBusy, setCommentBusy] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [linkPickerOpen, setLinkPickerOpen] = useState(false);
  const [availablePrs, setAvailablePrs] = useState<PullRequestSummaryDto[]>([]);
  const [loadingPrs, setLoadingPrs] = useState(false);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [prLinkBusy, setPrLinkBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTask(initialTask);
    setTitleDraft(initialTask.title);
    setDescriptionDraft(initialTask.description ?? "");
    setLabelsInput(initialTask.labels.join(", "));
    setEditingTitle(false);
    setEditingDescription(false);
    setEditingLabels(false);
    setEditingCommentId(null);
    setError(null);
    setNotice(null);
  }, [initialTask]);

  const isDirty =
    (editingTitle && titleDraft.trim() !== task.title) ||
    (editingDescription && descriptionDraft !== (task.description ?? "")) ||
    (editingLabels && labelsInput !== task.labels.join(", ")) ||
    (editingCommentId !== null && editingCommentBody.trim().length > 0) ||
    commentText.trim().length > 0;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  async function patchTask(payload: Record<string, unknown>, successMsg?: string) {
    setSavingField(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Could not update this task.");
        return false;
      }
      const updated = data as TaskDetailDto;
      setTask(updated);
      setTitleDraft(updated.title);
      setDescriptionDraft(updated.description ?? "");
      setLabelsInput(updated.labels.join(", "));
      onTaskUpdated?.(updated);
      if (successMsg) setNotice(successMsg);
      return true;
    } catch {
      setError("Network error while updating task. Please try again.");
      return false;
    } finally {
      setSavingField(false);
    }
  }

  async function handleSaveTitle(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patchTask({ title: titleDraft }, "Title updated.");
    if (ok) setEditingTitle(false);
  }

  async function handleSaveDescription(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patchTask({ description: descriptionDraft }, "Description saved.");
    if (ok) setEditingDescription(false);
  }

  async function handleSaveLabels(e: React.FormEvent) {
    e.preventDefault();
    const ok = await patchTask({ labels: labelsInput }, "Labels updated.");
    if (ok) setEditingLabels(false);
  }

  async function handleArchiveToggle() {
    if (!archiveConfirm) return;
    const action = archiveConfirm;
    setSavingField(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/${action}`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? `Could not ${action} task.`);
        return;
      }
      const updated = data as TaskDetailDto;
      setTask(updated);
      onTaskUpdated?.(updated);
      setNotice(action === "archive" ? "Task archived." : "Task restored.");
    } catch {
      setError("Network error while updating task archive state.");
    } finally {
      setSavingField(false);
      setArchiveConfirm(null);
    }
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: commentText }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Could not post comment.");
        return;
      }
      const created = data as TaskCommentDto;
      const updatedTask: TaskDetailDto = {
        ...task,
        comments: [...task.comments, created],
        commentCount: task.commentCount + 1,
      };
      setTask(updatedTask);
      setCommentText("");
      onTaskUpdated?.(updatedTask);
    } catch {
      setError("Network error while posting comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleEditComment(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCommentId || !editingCommentBody.trim()) return;
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(editingCommentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editingCommentBody }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Could not update comment.");
        return;
      }
      const updatedComment = data as TaskCommentDto;
      const updatedTask: TaskDetailDto = {
        ...task,
        comments: task.comments.map((c) => (c.id === updatedComment.id ? updatedComment : c)),
      };
      setTask(updatedTask);
      setEditingCommentId(null);
      setEditingCommentBody("");
      onTaskUpdated?.(updatedTask);
    } catch {
      setError("Network error while updating comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleDeleteComment() {
    if (!deleteCommentTarget) return;
    const id = deleteCommentTarget.id;
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/comments/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message ?? "Could not delete comment.");
        return;
      }
      const updatedTask: TaskDetailDto = {
        ...task,
        comments: task.comments.filter((c) => c.id !== id),
        commentCount: Math.max(0, task.commentCount - 1),
      };
      setTask(updatedTask);
      onTaskUpdated?.(updatedTask);
      setDeleteCommentTarget(null);
    } catch {
      setError("Network error while deleting comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function reloadFullTask() {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (res.ok && data) {
      const updated = data as TaskDetailDto;
      setTask(updated);
      onTaskUpdated?.(updated);
    }
  }

  async function openPrLinkPicker() {
    setLinkPickerOpen(true);
    setLoadingPrs(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests?state=ALL&limit=30`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => null)) as PullRequestsListResponseDto | null;
      if (res.ok && data) {
        setAvailablePrs(data.items ?? []);
      }
    } catch {
      setError("Could not load pull requests for this project.");
    } finally {
      setLoadingPrs(false);
    }
  }

  async function handleLinkPullRequest(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedPrId) return;
    setPrLinkBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/pull-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pullRequestId: selectedPrId }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not link pull request.");
        return;
      }
      setSelectedPrId("");
      setLinkPickerOpen(false);
      await reloadFullTask();
      setNotice("Pull request linked to task.");
    } catch {
      setError("Network error while linking pull request.");
    } finally {
      setPrLinkBusy(false);
    }
  }

  async function handleUnlinkPullRequest(pullRequestId: string) {
    setPrLinkBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/pull-requests/${encodeURIComponent(pullRequestId)}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not unlink pull request.");
        return;
      }
      await reloadFullTask();
      setNotice("Pull request unlinked.");
    } catch {
      setError("Network error while unlinking pull request.");
    } finally {
      setPrLinkBusy(false);
    }
  }

  async function copyDirectLink() {
    const url = `${window.location.origin}/app/projects/${projectId}/tasks/${task.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setCopiedLink(false);
    }
  }

  const directHref = `/app/projects/${projectId}/tasks/${task.id}`;
  const dueDateValue = task.dueDate ? task.dueDate.slice(0, 10) : "";

  return (
    <div className="task-detail-root">
      <div className="task-detail-topbar">
        <div className="inline-actions" style={{ gap: ".5rem" }}>
          <span className="project-key">{task.identifier}</span>
          <TaskStatusBadge status={task.status} />
          <TaskPriorityBadge priority={task.priority} />
          {task.archivedAt && <span className="badge badge-warm">Archived</span>}
        </div>

        <div className="inline-actions">
          <Button asChild variant="secondary" size="compact">
            <Link
              href={`/app/projects/${encodeURIComponent(projectId)}/ide?taskId=${encodeURIComponent(task.id)}`}
            >
              <Code2 size={14} /> Open IDE
            </Link>
          </Button>
          <Button asChild size="compact" variant={task.canRunAi && !task.archivedAt ? "primary" : "secondary"}>
            <Link
              href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/agent`}
            >
              <Sparkles size={14} />{" "}
              {task.latestAgentRun ? "AI Workspace" : task.canRunAi && !task.archivedAt ? "Run with AI" : "AI Runs"}
            </Link>
          </Button>
          <Button type="button" variant="secondary" size="compact" onClick={copyDirectLink}>
            {copiedLink ? <Check size={14} /> : <Copy size={14} />}
            {copiedLink ? "Copied" : "Copy link"}
          </Button>
          {inDrawer && (
            <Button asChild variant="secondary" size="compact">
              <Link href={directHref}>
                <ExternalLink size={14} /> Open page
              </Link>
            </Button>
          )}
          {task.canArchiveTask && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              disabled={savingField}
              onClick={() => setArchiveConfirm(task.archivedAt ? "restore" : "archive")}
            >
              {task.archivedAt ? (
                <>
                  <ArchiveRestore size={14} /> Restore
                </>
              ) : (
                <>
                  <Archive size={14} /> Archive
                </>
              )}
            </Button>
          )}
          {inDrawer && onCloseDrawer && (
            <button
              type="button"
              className="drawer-close-btn"
              aria-label="Close task panel"
              onClick={onCloseDrawer}
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {task.archivedAt && (
        <p className="banner banner-neutral" role="status">
          This task is archived ({formatShortDate(task.archivedAt)}). Editing and commenting are
          disabled while preserving its comments and activity history.
        </p>
      )}
      {task.projectStatus === "ARCHIVED" && (
        <p className="banner banner-neutral" role="status">
          Parent project is archived. Tasks and comments are read-only until restored.
        </p>
      )}
      {error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {error}
          </span>
        </p>
      )}
      {notice && (
        <p className="banner banner-success" role="status">
          <span className="inline-actions">
            <Check size={16} />
            {notice}
          </span>
        </p>
      )}

      <div className={`task-detail-grid ${inDrawer ? "task-detail-grid-drawer" : ""}`}>
        <div className="form-stack">
          <section className="app-card">
            {editingTitle && task.canEditTask ? (
              <form onSubmit={handleSaveTitle} className="form-stack">
                <label className="field-group">
                  Task title
                  <input
                    type="text"
                    className="field-input"
                    required
                    minLength={2}
                    maxLength={180}
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    autoFocus
                  />
                </label>
                <div className="inline-actions">
                  <Button type="submit" size="compact" disabled={savingField}>
                    {savingField ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={savingField}
                    onClick={() => {
                      setTitleDraft(task.title);
                      setEditingTitle(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="task-title-row">
                <h1 className="task-detail-title">{task.title}</h1>
                {task.canEditTask && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => setEditingTitle(true)}
                  >
                    <Pencil size={13} /> Edit title
                  </Button>
                )}
              </div>
            )}

            <div className="task-desc-block">
              <div className="app-card-header" style={{ marginBottom: ".6rem" }}>
                <h2>Description</h2>
                {task.canEditTask && !editingDescription && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => setEditingDescription(true)}
                  >
                    <Pencil size={13} /> {task.description ? "Edit" : "Add description"}
                  </Button>
                )}
              </div>

              {editingDescription && task.canEditTask ? (
                <form onSubmit={handleSaveDescription} className="form-stack">
                  <textarea
                    className="field-textarea"
                    style={{ minHeight: "8.5rem" }}
                    maxLength={10000}
                    value={descriptionDraft}
                    onChange={(e) => setDescriptionDraft(e.target.value)}
                    placeholder="Describe acceptance criteria, context, or implementation notes…"
                  />
                  <div className="inline-actions">
                    <Button type="submit" size="compact" disabled={savingField}>
                      {savingField ? "Saving…" : "Save description"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      disabled={savingField}
                      onClick={() => {
                        setDescriptionDraft(task.description ?? "");
                        setEditingDescription(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : task.description ? (
                <p className="task-description-text">{task.description}</p>
              ) : (
                <p className="field-hint">No description added yet.</p>
              )}
            </div>
          </section>

          <section className="app-card" aria-labelledby="task-prs-heading">
            <div className="app-card-header">
              <h2 id="task-prs-heading" className="inline-actions">
                <GitPullRequest size={17} /> Linked Pull Requests (
                {(task.linkedPullRequests ?? []).length})
              </h2>
              {task.canEditTask && !linkPickerOpen && (
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  onClick={() => void openPrLinkPicker()}
                >
                  <Link2 size={13} /> Link PR
                </Button>
              )}
            </div>

            {linkPickerOpen && task.canEditTask && (
              <form
                onSubmit={handleLinkPullRequest}
                className="form-stack"
                style={{
                  marginBottom: "1rem",
                  padding: ".75rem",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  background: "var(--well)",
                }}
              >
                <label className="field-group">
                  Select a pull request from this project&apos;s connected repository
                  <select
                    className="field-select"
                    disabled={loadingPrs || prLinkBusy}
                    value={selectedPrId}
                    onChange={(e) => setSelectedPrId(e.target.value)}
                  >
                    <option value="">
                      {loadingPrs
                        ? "Loading pull requests…"
                        : availablePrs.length === 0
                          ? "No synced pull requests available"
                          : "Choose pull request…"}
                    </option>
                    {availablePrs
                      .filter(
                        (pr) =>
                          !(task.linkedPullRequests ?? []).some((l) => l.pullRequestId === pr.id),
                      )
                      .map((pr) => (
                        <option key={pr.id} value={pr.id}>
                          #{pr.number} · {pr.title} ({pr.state})
                        </option>
                      ))}
                  </select>
                </label>
                <div className="inline-actions">
                  <Button
                    type="submit"
                    size="compact"
                    disabled={prLinkBusy || loadingPrs || !selectedPrId}
                  >
                    {prLinkBusy ? "Linking…" : "Confirm link"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    onClick={() => setLinkPickerOpen(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {(task.linkedPullRequests ?? []).length === 0 ? (
              <p className="field-hint">
                No GitHub pull requests linked to this task yet.
              </p>
            ) : (
              <div className="form-stack" style={{ gap: ".55rem" }}>
                {(task.linkedPullRequests ?? []).map((pr) => (
                  <div key={pr.linkId} className="overview-task-row">
                    <Link
                      href={`/app/projects/${projectId}/pull-requests/${pr.number}`}
                      className="task-link-row"
                      style={{ flex: 1 }}
                    >
                      <span className="project-key">#{pr.number}</span>
                      <strong className="truncate-text">{pr.title}</strong>
                    </Link>
                    <div className="inline-actions" style={{ gap: ".4rem" }}>
                      <PullRequestStateBadge state={pr.state} isDraft={pr.isDraft} />
                      <a
                        href={pr.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="icon-action-btn"
                        aria-label={`Open PR #${pr.number} on GitHub`}
                        title="Open on GitHub"
                      >
                        <ExternalLink size={12} />
                      </a>
                      {task.canEditTask && (
                        <button
                          type="button"
                          className="icon-action-btn icon-action-danger"
                          aria-label={`Unlink PR #${pr.number}`}
                          disabled={prLinkBusy}
                          onClick={() => void handleUnlinkPullRequest(pr.pullRequestId)}
                        >
                          <Unlink size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="app-card" aria-labelledby="task-ai-agent-heading">
            <div className="app-card-header">
              <h2 id="task-ai-agent-heading" className="inline-actions">
                <Bot size={17} /> AI Coding Agent
              </h2>
              <Button asChild variant="secondary" size="compact">
                <Link
                  href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/agent`}
                >
                  <Sparkles size={13} />{" "}
                  {task.latestAgentRun ? "Open AI Workspace" : "Run with AI"}
                </Link>
              </Button>
            </div>

            {task.latestAgentRun ? (
              <div className="overview-task-row">
                <div className="inline-actions" style={{ gap: ".55rem", flexWrap: "wrap" }}>
                  <AgentRunStatusBadge status={task.latestAgentRun.status} />
                  <span className="field-hint">
                    {task.latestAgentRun.repoFullName} ·{" "}
                    <code>{task.latestAgentRun.baseBranch}</code>
                  </span>
                </div>
                <div className="inline-actions" style={{ gap: ".5rem" }}>
                  <span className="field-hint" style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                    {task.latestAgentRun.usageTotals.totalTokens.toLocaleString()} tok ·{" "}
                    {formatUsd(task.latestAgentRun.usageTotals.estimatedCostUsd)}
                  </span>
                  <Link
                    href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/agent?runId=${encodeURIComponent(task.latestAgentRun.id)}`}
                    className="text-action-link"
                  >
                    Inspect run
                  </Link>
                </div>
              </div>
            ) : (
              <p className="field-hint">
                Generate a structured implementation plan against the connected repository, approve
                execution, inspect validated diffs, and accept or request revisions inside DevCollab.
              </p>
            )}
          </section>

          <section className="app-card" aria-labelledby="task-comments-heading">
            <div className="app-card-header">
              <h2 id="task-comments-heading" className="inline-actions">
                <MessageSquare size={17} /> Comments ({task.comments.length})
              </h2>
            </div>

            {task.comments.length === 0 ? (
              <p className="field-hint" style={{ marginBottom: "1rem" }}>
                No comments yet. Start the discussion below.
              </p>
            ) : (
              <ul className="comment-list">
                {task.comments.map((comment) => {
                  const authorName =
                    comment.author?.name?.trim() || comment.author?.email || "Former member";
                  const isEditingThis = editingCommentId === comment.id;
                  return (
                    <li key={comment.id} className="comment-item">
                      <div className="comment-head">
                        <div className="inline-actions" style={{ gap: ".55rem" }}>
                          <UserAvatar user={comment.author} size="sm" />
                          <div>
                            <strong style={{ fontSize: ".9rem" }}>{authorName}</strong>
                            <span className="comment-meta">
                              {formatDateTime(comment.createdAt)}
                              {comment.editedAt ? " · edited" : ""}
                            </span>
                          </div>
                        </div>

                        {task.canEditTask && !isEditingThis && (
                          <div className="inline-actions" style={{ gap: ".35rem" }}>
                            {comment.canEdit && (
                              <button
                                type="button"
                                className="icon-action-btn"
                                aria-label="Edit comment"
                                onClick={() => {
                                  setEditingCommentId(comment.id);
                                  setEditingCommentBody(comment.body);
                                }}
                              >
                                <Pencil size={13} />
                              </button>
                            )}
                            {comment.canDelete && (
                              <button
                                type="button"
                                className="icon-action-btn icon-action-danger"
                                aria-label="Delete comment"
                                onClick={() => setDeleteCommentTarget(comment)}
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {isEditingThis ? (
                        <form onSubmit={handleEditComment} className="form-stack" style={{ marginTop: ".5rem" }}>
                          <textarea
                            className="field-textarea"
                            required
                            maxLength={4000}
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                          />
                          <div className="inline-actions">
                            <Button type="submit" size="compact" disabled={commentBusy}>
                              {commentBusy ? "Saving…" : "Save"}
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={commentBusy}
                              onClick={() => {
                                setEditingCommentId(null);
                                setEditingCommentBody("");
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </form>
                      ) : (
                        <p className="comment-body">{comment.body}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {task.canEditTask && (
              <form onSubmit={handleAddComment} className="form-stack" style={{ marginTop: "1rem" }}>
                <label className="field-group">
                  Add a comment
                  <textarea
                    className="field-textarea"
                    maxLength={4000}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Share a status update, design note, or review question…"
                  />
                </label>
                <div>
                  <Button
                    type="submit"
                    size="compact"
                    disabled={commentBusy || !commentText.trim()}
                  >
                    <Send size={14} />
                    {commentBusy ? "Posting…" : "Post Comment"}
                  </Button>
                </div>
              </form>
            )}
          </section>
        </div>

        <aside className="form-stack" aria-label="Task properties and activity">
          <section className="app-card form-stack">
            <h2>Details</h2>

            <label className="field-group">
              Status
              <select
                className="field-select"
                value={task.status}
                disabled={!task.canEditTask || savingField}
                onChange={(e) => patchTask({ status: e.target.value as TaskStatus })}
              >
                {TASK_STATUS_ORDER.map((status) => (
                  <option key={status} value={status}>
                    {TASK_STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              Priority
              <select
                className="field-select"
                value={task.priority}
                disabled={!task.canEditTask || savingField}
                onChange={(e) => patchTask({ priority: e.target.value as TaskPriority })}
              >
                {TASK_PRIORITY_ORDER.map((priority) => (
                  <option key={priority} value={priority}>
                    {TASK_PRIORITY_LABEL[priority]}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              Assignee
              <select
                className="field-select"
                value={task.assignee?.id ?? ""}
                disabled={!task.canEditTask || savingField}
                onChange={(e) => patchTask({ assigneeId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {orgMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.name || member.email}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-group">
              Due date
              <div className="inline-actions" style={{ gap: ".4rem" }}>
                <input
                  type="date"
                  className="field-input"
                  style={{ flex: 1 }}
                  value={dueDateValue}
                  disabled={!task.canEditTask || savingField}
                  onChange={(e) => patchTask({ dueDate: e.target.value || null })}
                />
                {task.canEditTask && dueDateValue && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={savingField}
                    onClick={() => patchTask({ dueDate: null })}
                  >
                    Clear
                  </Button>
                )}
              </div>
            </label>

            <div className="field-group">
              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                <span>Labels</span>
                {task.canEditTask && !editingLabels && (
                  <button
                    type="button"
                    className="text-action-link"
                    onClick={() => setEditingLabels(true)}
                  >
                    Edit
                  </button>
                )}
              </div>

              {editingLabels && task.canEditTask ? (
                <form onSubmit={handleSaveLabels} className="form-stack" style={{ gap: ".5rem" }}>
                  <input
                    type="text"
                    className="field-input mono-input"
                    value={labelsInput}
                    onChange={(e) => setLabelsInput(e.target.value)}
                    placeholder="api, auth, bug"
                  />
                  <span className="field-hint">Comma-separated tags (max 8).</span>
                  <div className="inline-actions">
                    <Button type="submit" size="compact" disabled={savingField}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="compact"
                      onClick={() => {
                        setLabelsInput(task.labels.join(", "));
                        setEditingLabels(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : task.labels.length === 0 ? (
                <span className="field-hint">None</span>
              ) : (
                <div className="inline-actions" style={{ gap: ".35rem" }}>
                  {task.labels.map((label) => (
                    <span key={label} className="label-chip">
                      {label}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <dl className="meta-kv">
              <div>
                <dt>Creator</dt>
                <dd>{task.creator?.name || task.creator?.email || "—"}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatDateTime(task.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(task.updatedAt)}</dd>
              </div>
              {task.completedAt && (
                <div>
                  <dt>Completed</dt>
                  <dd>{formatDateTime(task.completedAt)}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="app-card" aria-labelledby="task-activity-heading">
            <div className="app-card-header">
              <h2 id="task-activity-heading" className="inline-actions">
                <History size={16} /> Activity ({task.activities.length})
              </h2>
            </div>

            {task.activities.length === 0 ? (
              <p className="field-hint">No activity recorded.</p>
            ) : (
              <ul className="activity-list">
                {task.activities.map((entry) => (
                  <li key={entry.id} className="activity-item">
                    <p>{entry.summary}</p>
                    <small>{formatDateTime(entry.createdAt)}</small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(deleteCommentTarget)}
        title="Delete comment?"
        description="This permanently removes the comment from the task discussion."
        confirmLabel="Delete comment"
        danger
        busy={commentBusy}
        onConfirm={handleDeleteComment}
        onCancel={() => setDeleteCommentTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(archiveConfirm)}
        title={archiveConfirm === "archive" ? `Archive ${task.identifier}?` : `Restore ${task.identifier}?`}
        description={
          archiveConfirm === "archive"
            ? "Archived tasks leave the active board and list while preserving all comments and activity."
            : "Restoring returns this task to the active board and list."
        }
        confirmLabel={archiveConfirm === "archive" ? "Archive task" : "Restore task"}
        danger={archiveConfirm === "archive"}
        busy={savingField}
        onConfirm={handleArchiveToggle}
        onCancel={() => setArchiveConfirm(null)}
      />
    </div>
  );
}
