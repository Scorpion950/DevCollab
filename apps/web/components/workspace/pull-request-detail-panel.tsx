"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCode2,
  GitBranch,
  Link2,
  MessageSquare,
  Pencil,
  RefreshCw,
  Send,
  Trash2,
  Unlink,
} from "lucide-react";
import type {
  InternalReviewDecision,
  PullRequestDetailDto,
  PullRequestFilesResponseDto,
  PullRequestReviewCommentDto,
  TaskSummaryDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { CodeDiffViewer, type LineCommentAnchor } from "./code-diff-viewer";
import { ConfirmDialog } from "./confirm-dialog";
import {
  GitHubReviewStateBadge,
  INTERNAL_DECISION_LABEL,
  InternalReviewBadge,
  PullRequestStateBadge,
  RepoConnectionBadge,
} from "./github-badges";
import { ProjectSubnav } from "./project-subnav";
import { formatDateTime, TaskPriorityBadge, TaskStatusBadge, UserAvatar } from "./task-badges";

const DECISION_OPTIONS: InternalReviewDecision[] = [
  "READY_FOR_REVIEW",
  "INTERNALLY_APPROVED",
  "CHANGES_SUGGESTED",
  "NEEDS_DISCUSSION",
  "NONE",
];

export function PullRequestDetailPanel({
  projectId,
  projectKey,
  projectName,
  initialDetail,
  projectTasks,
}: {
  projectId: string;
  projectKey: string;
  projectName: string;
  initialDetail: PullRequestDetailDto;
  projectTasks: TaskSummaryDto[];
}) {
  const [detail, setDetail] = useState<PullRequestDetailDto>(initialDetail);
  const [activeTab, setActiveTab] = useState<"overview" | "files">("overview");
  const [filesState, setFilesState] = useState<{
    loaded: boolean;
    loading: boolean;
    data: PullRequestFilesResponseDto | null;
    error: string | null;
  }>({ loaded: false, loading: false, data: null, error: null });

  const [decisionDraft, setDecisionDraft] = useState<InternalReviewDecision>("READY_FOR_REVIEW");
  const [decisionSummary, setDecisionSummary] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);

  const [commentBody, setCommentBody] = useState("");
  const [inlineDraft, setInlineDraft] = useState("");
  const [activeAnchor, setActiveAnchor] = useState<LineCommentAnchor | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<PullRequestReviewCommentDto | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [linkingTask, setLinkingTask] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const pr = detail.pullRequest;
  const repo = detail.repository;
  const linkedTaskIds = new Set(detail.linkedTasks.map((t) => t.taskId));
  const linkableTasks = projectTasks.filter((t) => !t.archivedAt && !linkedTaskIds.has(t.id));

  const reloadDetail = useCallback(async () => {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}`,
      { cache: "no-store" },
    );
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setDetail(json as PullRequestDetailDto);
    }
  }, [pr.number, projectId]);

  const loadFiles = useCallback(async () => {
    setFilesState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/files`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFilesState({
          loaded: true,
          loading: false,
          data: null,
          error: json?.message || "Failed to load changed files.",
        });
        return;
      }
      setFilesState({
        loaded: true,
        loading: false,
        data: json as PullRequestFilesResponseDto,
        error: null,
      });
    } catch {
      setFilesState({
        loaded: true,
        loading: false,
        data: null,
        error: "Network error loading pull request diff.",
      });
    }
  }, [pr.number, projectId]);

  function switchTab(next: "overview" | "files") {
    setActiveTab(next);
    if (next === "files" && !filesState.loaded && !filesState.loading) {
      void loadFiles();
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/sync`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Synchronization failed.");
        return;
      }
      await reloadDetail();
      if (filesState.loaded) void loadFiles();
      setNotice("Pull request synced from GitHub.");
    } catch {
      setError("Network error synchronizing pull request.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSubmitDecision(event: React.FormEvent) {
    event.preventDefault();
    setSavingDecision(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/internal-review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: decisionDraft, summary: decisionSummary }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not record internal review decision.");
        return;
      }
      await reloadDetail();
      setDecisionSummary("");
      setNotice("DevCollab internal review decision updated.");
    } catch {
      setError("Network error recording internal review decision.");
    } finally {
      setSavingDecision(false);
    }
  }

  async function handlePostComment(
    event: React.FormEvent,
    payload: { body: string; anchor?: LineCommentAnchor | null },
  ) {
    event.preventDefault();
    const body = payload.body.trim();
    if (!body) return;
    setCommentBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/comments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body,
            ...(payload.anchor
              ? {
                  filePath: payload.anchor.filePath,
                  lineNumber: payload.anchor.lineNumber,
                  lineSide: payload.anchor.lineSide,
                }
              : {}),
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not post review comment.");
        return;
      }
      await reloadDetail();
      if (payload.anchor) {
        setInlineDraft("");
        setActiveAnchor(null);
      } else {
        setCommentBody("");
      }
      setNotice("Internal review comment posted.");
    } catch {
      setError("Network error posting review comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleEditComment(event: React.FormEvent) {
    event.preventDefault();
    if (!editingCommentId || !editingCommentBody.trim()) return;
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/comments/${encodeURIComponent(editingCommentId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: editingCommentBody.trim() }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not update comment.");
        return;
      }
      setEditingCommentId(null);
      setEditingCommentBody("");
      await reloadDetail();
    } catch {
      setError("Network error updating comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleDeleteComment() {
    if (!deleteTarget) return;
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/comments/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Could not delete comment.");
        return;
      }
      setDeleteTarget(null);
      await reloadDetail();
    } catch {
      setError("Network error deleting comment.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleResolveToggle(comment: PullRequestReviewCommentDto) {
    setCommentBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/comments/${encodeURIComponent(comment.id)}/resolve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resolved: comment.status !== "RESOLVED" }),
        },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Could not update comment thread status.");
        return;
      }
      await reloadDetail();
    } catch {
      setError("Network error updating thread status.");
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleLinkTask(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedTaskId) return;
    setLinkingTask(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/tasks`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: selectedTaskId }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not link task to this pull request.");
        return;
      }
      setSelectedTaskId("");
      await reloadDetail();
      setNotice("Task linked to pull request.");
    } catch {
      setError("Network error linking task.");
    } finally {
      setLinkingTask(false);
    }
  }

  async function handleUnlinkTask(taskId: string) {
    setLinkingTask(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/github/pull-requests/${pr.number}/tasks/${encodeURIComponent(taskId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.message || "Could not unlink task.");
        return;
      }
      await reloadDetail();
    } catch {
      setError("Network error unlinking task.");
    } finally {
      setLinkingTask(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{projectKey}</span>
            <span>{repo.fullName}</span>
            <span className="project-key">#{pr.number}</span>
            <PullRequestStateBadge state={pr.state} isDraft={pr.isDraft} />
            <RepoConnectionBadge status={repo.status} />
          </p>
          <h1>{pr.title}</h1>
          <p className="page-subtitle">
            {projectName} · Opened by <strong>{pr.authorLogin}</strong> ·{" "}
            <span className="comment-meta" style={{ display: "inline" }}>
              <GitBranch size={12} style={{ display: "inline", marginRight: 3 }} />
              {pr.headRef} → {pr.baseRef} · head {pr.headSha.slice(0, 7)}
            </span>
          </p>
          <ProjectSubnav
            projectId={projectId}
            active="pull-requests"
            canManageProject={detail.canManageRepository}
          />
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href={`/app/projects/${projectId}/pull-requests`}>
              <ArrowLeft size={14} /> All PRs
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={syncing || !detail.canSync}
            onClick={handleSync}
          >
            <RefreshCw size={14} className={syncing ? "spin-icon" : ""} />
            {syncing ? "Syncing…" : "Sync PR"}
          </Button>
          <Button asChild size="compact">
            <a href={pr.htmlUrl} target="_blank" rel="noopener noreferrer">
              Open on GitHub <ExternalLink size={14} />
            </a>
          </Button>
        </div>
      </header>

      <div className="pr-subtabs-bar" role="tablist" aria-label="Pull request review views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "overview"}
          className="project-subnav-link"
          aria-current={activeTab === "overview" ? "page" : undefined}
          onClick={() => switchTab("overview")}
        >
          <MessageSquare size={15} /> Conversation & Review ({detail.comments.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "files"}
          className="project-subnav-link"
          aria-current={activeTab === "files" ? "page" : undefined}
          onClick={() => switchTab("files")}
        >
          <FileCode2 size={15} /> Files Changed ({pr.changedFilesCount}) ·{" "}
          <span className="diff-stat-add">+{pr.additions}</span>{" "}
          <span className="diff-stat-del">-{pr.deletions}</span>
        </button>
      </div>

      {error && (
        <p className="banner banner-error" role="alert">
          <AlertTriangle size={16} /> {error}
        </p>
      )}
      {notice && (
        <p className="banner banner-success" role="status">
          <CheckCircle2 size={16} /> {notice}
        </p>
      )}

      {activeTab === "files" ? (
        filesState.loading ? (
          <section className="app-card">
            <p className="field-hint">Loading changed files and diff patches from GitHub…</p>
          </section>
        ) : filesState.error ? (
          <section className="app-card">
            <p className="banner banner-error" role="alert">
              {filesState.error}
            </p>
          </section>
        ) : filesState.data?.unavailableReason ? (
          <section className="empty-panel">
            <AlertTriangle size={26} />
            <h2>Diff preview unavailable</h2>
            <p>{filesState.data.unavailableReason}</p>
            <Button asChild size="compact" variant="secondary">
              <a href={`${pr.htmlUrl}/files`} target="_blank" rel="noopener noreferrer">
                View changed files on GitHub <ExternalLink size={14} />
              </a>
            </Button>
          </section>
        ) : filesState.data ? (
          <CodeDiffViewer
            files={filesState.data.files}
            prHtmlUrl={pr.htmlUrl}
            truncatedResponse={filesState.data.truncated}
            comments={detail.comments}
            canReview={detail.canReview}
            activeAnchor={activeAnchor}
            onSelectLineAnchor={(anchor) => {
              setActiveAnchor(anchor);
              setInlineDraft("");
            }}
            onClearAnchor={() => {
              setActiveAnchor(null);
              setInlineDraft("");
            }}
            inlineCommentDraft={inlineDraft}
            onChangeInlineDraft={setInlineDraft}
            onSubmitInlineComment={(e) =>
              void handlePostComment(e, { body: inlineDraft, anchor: activeAnchor })
            }
            commentBusy={commentBusy}
          />
        ) : null
      ) : (
        <div className="task-detail-grid">
          <div className="form-stack">
            <section className="app-card" aria-labelledby="pr-description-heading">
              <div className="app-card-header">
                <h2 id="pr-description-heading">GitHub pull request summary</h2>
                <span className="badge">Synced from GitHub</span>
              </div>
              {pr.body ? (
                <p className="task-description-text">{pr.body}</p>
              ) : (
                <p className="field-hint">No pull request description provided on GitHub.</p>
              )}
              <dl className="meta-kv" style={{ marginTop: "1rem" }}>
                <div>
                  <dt>Changes</dt>
                  <dd>
                    {pr.changedFilesCount} files (+{pr.additions} / -{pr.deletions})
                  </dd>
                </div>
                <div>
                  <dt>Created on GitHub</dt>
                  <dd>{formatDateTime(pr.githubCreatedAt)}</dd>
                </div>
                <div>
                  <dt>Updated on GitHub</dt>
                  <dd>{formatDateTime(pr.githubUpdatedAt)}</dd>
                </div>
                {pr.mergedAt && (
                  <div>
                    <dt>Merged on GitHub</dt>
                    <dd>{formatDateTime(pr.mergedAt)}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="app-card" aria-labelledby="pr-discussion-heading">
              <div className="app-card-header">
                <h2 id="pr-discussion-heading" className="inline-actions">
                  <MessageSquare size={17} /> DevCollab internal review discussion (
                  {detail.comments.length})
                </h2>
                <span className="badge badge-sage">Internal only · never posted to GitHub</span>
              </div>

              {detail.comments.length === 0 ? (
                <p className="field-hint" style={{ marginBottom: "1rem" }}>
                  No internal review comments yet. Discuss changes below or open Files Changed to
                  comment directly on a diff line.
                </p>
              ) : (
                <ul className="comment-list">
                  {detail.comments.map((comment) => {
                    const authorName =
                      comment.author?.name?.trim() || comment.author?.email || "Member";
                    const isEditing = editingCommentId === comment.id;
                    return (
                      <li key={comment.id} className="comment-item">
                        <div className="comment-head">
                          <div className="inline-actions" style={{ gap: ".55rem", flexWrap: "wrap" }}>
                            <UserAvatar user={comment.author} size="sm" />
                            <div>
                              <strong style={{ fontSize: ".9rem" }}>{authorName}</strong>
                              <span className="comment-meta">
                                {formatDateTime(comment.createdAt)}
                                {comment.editedAt ? " · edited" : ""}
                                {" · "}commit {comment.commitSha.slice(0, 7)}
                              </span>
                            </div>
                            {comment.filePath && (
                              <span className="label-chip">
                                {comment.filePath}
                                {comment.lineNumber
                                  ? `:${comment.lineNumber} (${comment.lineSide === "LEFT" ? "old" : "new"})`
                                  : ""}
                              </span>
                            )}
                            {comment.isOutdated && (
                              <span className="badge badge-outdated">
                                <Clock size={11} /> Older commit
                              </span>
                            )}
                            <span
                              className={`badge ${comment.status === "RESOLVED" ? "badge-accent" : ""}`}
                            >
                              {comment.status === "RESOLVED" ? "Resolved" : "Open"}
                            </span>
                          </div>

                          {detail.canReview && !isEditing && (
                            <div className="inline-actions" style={{ gap: ".35rem" }}>
                              {comment.canResolve && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="compact"
                                  disabled={commentBusy}
                                  onClick={() => handleResolveToggle(comment)}
                                >
                                  {comment.status === "RESOLVED" ? "Reopen" : "Resolve"}
                                </Button>
                              )}
                              {comment.canEdit && (
                                <button
                                  type="button"
                                  className="icon-action-btn"
                                  aria-label="Edit review comment"
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
                                  aria-label="Delete review comment"
                                  onClick={() => setDeleteTarget(comment)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {isEditing ? (
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
                                Save
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                onClick={() => setEditingCommentId(null)}
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

              {detail.canReview && (
                <form
                  onSubmit={(e) => void handlePostComment(e, { body: commentBody })}
                  className="form-stack"
                  style={{ marginTop: "1rem" }}
                >
                  <label className="field-group">
                    Add internal PR comment
                    <textarea
                      className="field-textarea"
                      maxLength={4000}
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Leave internal review feedback or coordinate next steps…"
                    />
                  </label>
                  <div>
                    <Button
                      type="submit"
                      size="compact"
                      disabled={commentBusy || !commentBody.trim()}
                    >
                      <Send size={14} /> Post internal comment
                    </Button>
                  </div>
                </form>
              )}
            </section>
          </div>

          <aside className="form-stack" aria-label="Review states and linked tasks">
            <section className="app-card form-stack" aria-labelledby="gh-reviews-heading">
              <div className="app-card-header" style={{ marginBottom: 0 }}>
                <h2 id="gh-reviews-heading">GitHub Review Status</h2>
                <span className="badge">External GitHub data</span>
              </div>

              <div className="inline-actions" style={{ gap: ".45rem" }}>
                <GitHubReviewStateBadge decision={pr.githubReviewDecision} />
                {pr.mergeableState && (
                  <span className="badge">Merge state: {pr.mergeableState}</span>
                )}
              </div>

              {detail.githubReviewsUnavailable ? (
                <p className="field-hint">
                  Live GitHub review details could not be refreshed right now; displaying synced
                  metadata.
                </p>
              ) : detail.githubReviews.length === 0 ? (
                <p className="field-hint">No reviews submitted on GitHub yet.</p>
              ) : (
                <ul className="activity-list">
                  {detail.githubReviews.map((rev) => (
                    <li key={rev.id} className="activity-item">
                      <p>
                        <strong>{rev.authorLogin}</strong> · {rev.state}
                      </p>
                      {rev.submittedAt && <small>{formatDateTime(rev.submittedAt)}</small>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="app-card form-stack" aria-labelledby="internal-reviews-heading">
              <div className="app-card-header" style={{ marginBottom: 0 }}>
                <h2 id="internal-reviews-heading">DevCollab Internal Reviews</h2>
                <span className="badge badge-sage">Internal team state</span>
              </div>
              <p className="field-hint">
                Internal approvals apply only inside DevCollab and do not approve or merge on
                GitHub.
              </p>

              {detail.internalReviews.length > 0 && (
                <div className="form-stack" style={{ gap: ".55rem" }}>
                  {detail.internalReviews.map((rev) => (
                    <div key={rev.id} className="comment-item" style={{ padding: ".65rem .8rem" }}>
                      <div className="inline-actions" style={{ justifyContent: "space-between", gap: ".4rem" }}>
                        <strong style={{ fontSize: ".85rem" }}>
                          {rev.reviewer?.name || rev.reviewer?.email || "Member"}
                        </strong>
                        <span className="comment-meta">commit {rev.commitSha.slice(0, 7)}</span>
                      </div>
                      <div style={{ marginTop: ".35rem" }}>
                        <InternalReviewBadge decision={rev.decision} isOutdated={rev.isOutdated} />
                      </div>
                      {rev.summary && (
                        <p className="field-hint" style={{ marginTop: ".35rem" }}>
                          {rev.summary}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {detail.canReview && (
                <form
                  onSubmit={handleSubmitDecision}
                  className="form-stack"
                  style={{ paddingTop: ".75rem", borderTop: "1px solid var(--border)" }}
                >
                  <label className="field-group">
                    Record your DevCollab review status
                    <select
                      className="field-select"
                      value={decisionDraft}
                      onChange={(e) => setDecisionDraft(e.target.value as InternalReviewDecision)}
                    >
                      {DECISION_OPTIONS.map((d) => (
                        <option key={d} value={d}>
                          {INTERNAL_DECISION_LABEL[d]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <textarea
                    className="field-textarea"
                    style={{ minHeight: "4.5rem" }}
                    maxLength={1000}
                    value={decisionSummary}
                    onChange={(e) => setDecisionSummary(e.target.value)}
                    placeholder="Optional internal summary for your team…"
                  />
                  <Button type="submit" size="compact" disabled={savingDecision}>
                    {savingDecision ? "Saving…" : "Save internal review"}
                  </Button>
                </form>
              )}
            </section>

            <section className="app-card form-stack" aria-labelledby="linked-tasks-heading">
              <div className="app-card-header" style={{ marginBottom: 0 }}>
                <h2 id="linked-tasks-heading" className="inline-actions">
                  <Link2 size={16} /> Linked DevCollab Tasks ({detail.linkedTasks.length})
                </h2>
              </div>
              <p className="field-hint">
                Linking keeps PR context connected to tasks. Merging this PR will not automatically
                close linked tasks.
              </p>

              {detail.linkedTasks.length === 0 ? (
                <p className="field-hint">No tasks linked to this PR yet.</p>
              ) : (
                <div className="form-stack" style={{ gap: ".5rem" }}>
                  {detail.linkedTasks.map((t) => (
                    <div key={t.linkId} className="overview-task-row">
                      <Link
                        href={`/app/projects/${projectId}/tasks/${t.taskId}`}
                        className="task-link-row"
                        style={{ flex: 1 }}
                      >
                        <span className="project-key">{t.identifier}</span>
                        <span className="truncate-text">{t.title}</span>
                      </Link>
                      <div className="inline-actions" style={{ gap: ".35rem" }}>
                        <TaskStatusBadge status={t.status} />
                        <TaskPriorityBadge priority={t.priority} />
                        {detail.canLinkTasks && (
                          <button
                            type="button"
                            className="icon-action-btn icon-action-danger"
                            aria-label={`Unlink ${t.identifier}`}
                            disabled={linkingTask}
                            onClick={() => handleUnlinkTask(t.taskId)}
                          >
                            <Unlink size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {detail.canLinkTasks && linkableTasks.length > 0 && (
                <form onSubmit={handleLinkTask} className="inline-actions" style={{ gap: ".5rem" }}>
                  <select
                    className="field-select"
                    style={{ flex: 1 }}
                    aria-label="Select task to link"
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                  >
                    <option value="">Link a project task…</option>
                    {linkableTasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.identifier} · {t.title}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" size="compact" disabled={linkingTask || !selectedTaskId}>
                    Link
                  </Button>
                </form>
              )}
            </section>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete review comment?"
        description="This permanently removes the internal DevCollab review comment."
        confirmLabel="Delete comment"
        danger
        busy={commentBusy}
        onConfirm={handleDeleteComment}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}
