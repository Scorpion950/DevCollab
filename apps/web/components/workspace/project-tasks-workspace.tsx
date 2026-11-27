"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArchiveRestore,
  CircleAlert,
  Columns3,
  List,
  ListTodo,
  MessageSquare,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import type {
  ProjectTasksListResponseDto,
  TaskDetailDto,
  TaskPriority,
  TaskStatus,
  TaskSummaryDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import { ProjectSubnav } from "./project-subnav";
import {
  DueDateChip,
  TASK_PRIORITY_LABEL,
  TASK_PRIORITY_ORDER,
  TASK_STATUS_LABEL,
  TASK_STATUS_ORDER,
  TaskPriorityBadge,
  TaskStatusBadge,
  UserAvatar,
} from "./task-badges";
import { TaskDetailView } from "./task-detail-view";

type SortMode = "priority" | "newest" | "oldest" | "dueDate";
type ViewMode = "board" | "list";

function priorityRank(p: TaskPriority): number {
  return TASK_PRIORITY_ORDER.indexOf(p);
}

export function ProjectTasksWorkspace({
  initialData,
  initialView = "board",
  currentUserId,
  initialTaskId,
}: {
  initialData: ProjectTasksListResponseDto;
  initialView?: ViewMode;
  currentUserId: string;
  initialTaskId?: string | null;
}) {
  const { project, orgMembers } = initialData;
  const canEditProject = project.status === "ACTIVE";

  const [view, setView] = useState<ViewMode>(initialView);
  const [tasks, setTasks] = useState<TaskSummaryDto[]>(initialData.items);
  const [summary, setSummary] = useState(initialData.summary);

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TaskStatus>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<"ALL" | TaskPriority>("ALL");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("ALL");
  const [mineOnly, setMineOnly] = useState(false);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("priority");

  const [loadingList, setLoadingList] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<TaskStatus | null>(null);
  const [movingIds, setMovingIds] = useState<Set<string>>(() => new Set());

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createStatus, setCreateStatus] = useState<TaskStatus>("TODO");
  const [createPriority, setCreatePriority] = useState<TaskPriority>("MEDIUM");
  const [createAssigneeId, setCreateAssigneeId] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createLabels, setCreateLabels] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(initialTaskId ?? null);
  const [activeTaskDetail, setActiveTaskDetail] = useState<TaskDetailDto | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [drawerDirty, setDrawerDirty] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  const abortListRef = useRef<AbortController | null>(null);
  const firstFilterMount = useRef(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim());
    }, 240);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (firstFilterMount.current) {
      firstFilterMount.current = false;
      return;
    }

    abortListRef.current?.abort();
    const controller = new AbortController();
    abortListRef.current = controller;

    async function loadFiltered() {
      setLoadingList(true);
      setBoardError(null);
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
      if (mineOnly) params.set("mine", "true");
      else if (assigneeFilter !== "ALL") params.set("assigneeId", assigneeFilter);
      if (overdueOnly) params.set("overdue", "true");
      if (archivedOnly) params.set("archived", "true");
      params.set("sort", sortMode);

      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(project.id)}/tasks?${params.toString()}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setBoardError(body?.message ?? "Could not load project tasks.");
          return;
        }
        const payload = body as ProjectTasksListResponseDto;
        setTasks(payload.items);
        setSummary(payload.summary);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setBoardError("Could not reach the server while loading tasks.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingList(false);
        }
      }
    }

    loadFiltered();
    return () => controller.abort();
  }, [
    archivedOnly,
    assigneeFilter,
    mineOnly,
    overdueOnly,
    priorityFilter,
    project.id,
    searchQuery,
    sortMode,
    statusFilter,
  ]);

  useEffect(() => {
    if (!activeTaskId) {
      setActiveTaskDetail(null);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    async function loadDetail() {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(activeTaskId!)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setDetailError(data?.message ?? "Could not load task details.");
          return;
        }
        setActiveTaskDetail(data as TaskDetailDto);
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          setDetailError("Network error while loading task details.");
        }
      } finally {
        if (!controller.signal.aborted) setLoadingDetail(false);
      }
    }
    loadDetail();
    return () => controller.abort();
  }, [activeTaskId, project.id]);

  useEffect(() => {
    if (!activeTaskId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (drawerDirty) {
          setDiscardConfirmOpen(true);
        } else {
          setActiveTaskId(null);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeTaskId, drawerDirty]);

  const hasFilters =
    Boolean(searchInput) ||
    statusFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    assigneeFilter !== "ALL" ||
    mineOnly ||
    overdueOnly ||
    archivedOnly ||
    sortMode !== "priority";

  function resetFilters() {
    setSearchInput("");
    setSearchQuery("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
    setAssigneeFilter("ALL");
    setMineOnly(false);
    setOverdueOnly(false);
    setArchivedOnly(false);
    setSortMode("priority");
  }

  function switchView(next: ViewMode) {
    setView(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (next === "list") url.searchParams.set("view", "list");
      else url.searchParams.delete("view");
      window.history.replaceState(null, "", url.toString());
    }
  }

  const columns = useMemo(() => {
    const grouped: Record<TaskStatus, TaskSummaryDto[]> = {
      BACKLOG: [],
      TODO: [],
      IN_PROGRESS: [],
      IN_REVIEW: [],
      DONE: [],
    };
    for (const task of tasks) {
      grouped[task.status].push(task);
    }
    for (const status of TASK_STATUS_ORDER) {
      grouped[status].sort((a, b) => {
        if (sortMode === "oldest") return a.createdAt.localeCompare(b.createdAt);
        if (sortMode === "newest") return b.createdAt.localeCompare(a.createdAt);
        if (sortMode === "dueDate") {
          if (!a.dueDate && !b.dueDate) return priorityRank(a.priority) - priorityRank(b.priority);
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        }
        const pr = priorityRank(a.priority) - priorityRank(b.priority);
        return pr !== 0 ? pr : b.updatedAt.localeCompare(a.updatedAt);
      });
    }
    return grouped;
  }, [sortMode, tasks]);

  async function moveTaskStatus(taskId: string, nextStatus: TaskStatus) {
    if (!canEditProject || archivedOnly) return;
    const current = tasks.find((t) => t.id === taskId);
    if (!current || current.status === nextStatus || movingIds.has(taskId)) return;

    const snapshot = tasks;
    const nextMoving = new Set(movingIds);
    nextMoving.add(taskId);
    setMovingIds(nextMoving);
    setBoardError(null);

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId ? { ...t, status: nextStatus, updatedAt: new Date().toISOString() } : t,
      ),
    );

    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(taskId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setTasks(snapshot);
        setBoardError(
          data?.message ?? `Failed to move ${current.identifier}. Changes have been reverted.`,
        );
        return;
      }
      const updated = data as TaskDetailDto;
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      if (activeTaskDetail?.id === updated.id) {
        setActiveTaskDetail(updated);
      }
    } catch {
      setTasks(snapshot);
      setBoardError(`Network error moving ${current.identifier}. Changes have been reverted.`);
    } finally {
      setMovingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(taskId);
        return copy;
      });
    }
  }

  async function handleCreateTask(event: React.FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/workspace/projects/${encodeURIComponent(project.id)}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle,
          description: createDescription,
          status: createStatus,
          priority: createPriority,
          assigneeId: createAssigneeId || null,
          dueDate: createDueDate || null,
          labels: createLabels,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(data?.message ?? "Could not create task.");
        return;
      }
      const created = data as TaskDetailDto;
      if (!archivedOnly) {
        setTasks((prev) => [created, ...prev]);
      }
      setSummary((prev) => ({
        ...prev,
        totalActive: prev.totalActive + 1,
      }));
      setCreateOpen(false);
      setCreateTitle("");
      setCreateDescription("");
      setCreateStatus("TODO");
      setCreatePriority("MEDIUM");
      setCreateAssigneeId("");
      setCreateDueDate("");
      setCreateLabels("");
      setActiveTaskId(created.id);
      setActiveTaskDetail(created);
    } catch {
      setCreateError("Network error while creating task. Your inputs were preserved.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleRestoreFromList(taskId: string) {
    setBoardError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(taskId)}/restore`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setBoardError(data?.message ?? "Could not restore task.");
        return;
      }
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch {
      setBoardError("Network error while restoring task.");
    }
  }

  function handleDetailUpdated(updated: TaskDetailDto) {
    setActiveTaskDetail(updated);
    if ((archivedOnly && !updated.archivedAt) || (!archivedOnly && updated.archivedAt)) {
      setTasks((prev) => prev.filter((t) => t.id !== updated.id));
    } else {
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    }
  }

  function requestCloseDrawer() {
    if (drawerDirty) {
      setDiscardConfirmOpen(true);
    } else {
      setActiveTaskId(null);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span className={`badge ${project.status === "ACTIVE" ? "badge-accent" : "badge-warm"}`}>
              {project.status}
            </span>
            <span>{summary.totalActive} active tasks</span>
          </p>
          <h1>{project.name} · Tasks</h1>
          <ProjectSubnav
            projectId={project.id}
            active={view === "list" ? "list" : "board"}
            canManageProject={project.canManageProject}
          />
        </div>

        <div className="page-actions">
          <div className="inline-actions" role="group" aria-label="Task view mode">
            <Button
              type="button"
              size="compact"
              variant={view === "board" ? "primary" : "secondary"}
              onClick={() => switchView("board")}
            >
              <Columns3 size={14} /> Board View
            </Button>
            <Button
              type="button"
              size="compact"
              variant={view === "list" ? "primary" : "secondary"}
              onClick={() => switchView("list")}
            >
              <List size={14} /> List View
            </Button>
          </div>
          {canEditProject && (
            <Button type="button" size="compact" onClick={() => setCreateOpen(true)}>
              <Plus size={15} /> New Task
            </Button>
          )}
        </div>
      </header>

      {!canEditProject && (
        <p className="banner banner-neutral" role="status">
          This project is archived. Tasks can be viewed, but creating or updating tasks is disabled.
        </p>
      )}

      <section className="task-toolbar" aria-label="Search and filter tasks">
        <label className="task-search-wrap">
          <span className="sr-only">Search tasks</span>
          <Search size={15} className="task-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="field-input task-search-input"
            placeholder="Search by title, ID (e.g. ATL-001), or description…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </label>

        <select
          aria-label="Filter by status"
          className="field-select toolbar-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as "ALL" | TaskStatus)}
        >
          <option value="ALL">All statuses</option>
          {TASK_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by priority"
          className="field-select toolbar-select"
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value as "ALL" | TaskPriority)}
        >
          <option value="ALL">All priorities</option>
          {TASK_PRIORITY_ORDER.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABEL[p]}
            </option>
          ))}
        </select>

        <select
          aria-label="Filter by assignee"
          className="field-select toolbar-select"
          value={mineOnly ? currentUserId : assigneeFilter}
          disabled={mineOnly}
          onChange={(e) => setAssigneeFilter(e.target.value)}
        >
          <option value="ALL">All assignees</option>
          <option value="UNASSIGNED">Unassigned</option>
          {orgMembers.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name || m.email}
            </option>
          ))}
        </select>

        <select
          aria-label="Sort tasks"
          className="field-select toolbar-select"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="priority">Sort: Priority</option>
          <option value="newest">Sort: Newest</option>
          <option value="oldest">Sort: Oldest</option>
          <option value="dueDate">Sort: Due date</option>
        </select>

        <div className="inline-actions" style={{ gap: ".45rem" }}>
          <Button
            type="button"
            size="compact"
            variant={mineOnly ? "primary" : "secondary"}
            onClick={() => setMineOnly((v) => !v)}
          >
            My tasks
          </Button>
          <Button
            type="button"
            size="compact"
            variant={overdueOnly ? "primary" : "secondary"}
            onClick={() => setOverdueOnly((v) => !v)}
          >
            Overdue
          </Button>
          <Button
            type="button"
            size="compact"
            variant={archivedOnly ? "primary" : "secondary"}
            onClick={() => setArchivedOnly((v) => !v)}
          >
            Archived ({summary.archived})
          </Button>
          {hasFilters && (
            <Button type="button" size="compact" variant="secondary" onClick={resetFilters}>
              <RotateCcw size={13} /> Reset
            </Button>
          )}
        </div>
      </section>

      {boardError && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {boardError}
          </span>
          <button
            type="button"
            className="text-action-link"
            onClick={() => setBoardError(null)}
          >
            Dismiss
          </button>
        </p>
      )}

      {tasks.length === 0 && !loadingList && view === "list" ? (
        <section className="empty-panel">
          <ListTodo size={26} />
          <h2>{hasFilters ? "No tasks match your filters" : "No tasks in this project yet"}</h2>
          <p>
            {hasFilters
              ? "Reset your active filters or search query to see other tasks."
              : canEditProject
                ? "Create the first task to start organizing work across your team."
                : "No tasks were created in this project before it was archived."}
          </p>
          <div className="inline-actions">
            {hasFilters && (
              <Button type="button" variant="secondary" size="compact" onClick={resetFilters}>
                Reset filters
              </Button>
            )}
            {canEditProject && !archivedOnly && (
              <Button type="button" size="compact" onClick={() => setCreateOpen(true)}>
                <Plus size={14} /> Create task
              </Button>
            )}
          </div>
        </section>
      ) : view === "board" ? (
        archivedOnly ? (
          <section className="app-card" aria-busy={loadingList}>
            <div className="app-card-header">
              <h2>Archived tasks ({tasks.length})</h2>
            </div>
            {tasks.length === 0 ? (
              <p className="field-hint">No archived tasks found.</p>
            ) : (
              <div className="form-stack">
                {tasks.map((task) => (
                  <div key={task.id} className="archived-task-row">
                    <div>
                      <button
                        type="button"
                        className="task-link-row"
                        onClick={() => setActiveTaskId(task.id)}
                      >
                        <span className="project-key">{task.identifier}</span>
                        <strong>{task.title}</strong>
                      </button>
                    </div>
                    <div className="inline-actions">
                      <TaskStatusBadge status={task.status} />
                      {project.canManageProject && project.status === "ACTIVE" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="compact"
                          onClick={() => handleRestoreFromList(task.id)}
                        >
                          <ArchiveRestore size={14} /> Restore
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section aria-label="Kanban board" aria-busy={loadingList}>
            {tasks.length === 0 && !hasFilters && canEditProject && (
              <div className="banner banner-neutral" style={{ marginBottom: "1rem" }}>
                <span>No tasks yet. Create your first task or drag cards between columns as work progresses.</span>
                <Button type="button" size="compact" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> Create task
                </Button>
              </div>
            )}
            <div className="kanban-board">
              {TASK_STATUS_ORDER.map((status) => {
                const colTasks = columns[status];
                const isDropActive = dropTargetStatus === status;
                return (
                  <div
                    key={status}
                    className="kanban-column"
                    data-drop-active={isDropActive}
                    onDragOver={(e) => {
                      if (!canEditProject || !draggedTaskId) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropTargetStatus !== status) setDropTargetStatus(status);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDropTargetStatus((prev) => (prev === status ? null : prev));
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedId = e.dataTransfer.getData("text/plain") || draggedTaskId;
                      setDropTargetStatus(null);
                      setDraggedTaskId(null);
                      if (droppedId) moveTaskStatus(droppedId, status);
                    }}
                  >
                    <header className="kanban-column-header">
                      <div className="inline-actions" style={{ gap: ".45rem" }}>
                        <span className={`status-dot status-dot-${status.toLowerCase()}`} aria-hidden="true" />
                        <h2>{TASK_STATUS_LABEL[status]}</h2>
                      </div>
                      <span className="count">{colTasks.length}</span>
                    </header>

                    <div className="kanban-column-body">
                      {colTasks.length === 0 ? (
                        <div className="kanban-empty">
                          {isDropActive ? "Drop task here" : `No ${TASK_STATUS_LABEL[status].toLowerCase()} tasks`}
                        </div>
                      ) : (
                        colTasks.map((task) => {
                          const isMoving = movingIds.has(task.id);
                          return (
                            <article
                              key={task.id}
                              className="kanban-card"
                              draggable={canEditProject && !isMoving}
                              data-dragging={draggedTaskId === task.id}
                              aria-busy={isMoving}
                              onDragStart={(e) => {
                                setDraggedTaskId(task.id);
                                e.dataTransfer.setData("text/plain", task.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => {
                                setDraggedTaskId(null);
                                setDropTargetStatus(null);
                              }}
                            >
                              <div className="kanban-card-top">
                                <span className="project-key">{task.identifier}</span>
                                <TaskPriorityBadge priority={task.priority} />
                              </div>

                              <button
                                type="button"
                                className="kanban-card-title"
                                title={task.title}
                                onClick={() => setActiveTaskId(task.id)}
                              >
                                {task.title}
                              </button>

                              {task.labels.length > 0 && (
                                <div className="kanban-card-labels">
                                  {task.labels.slice(0, 3).map((label) => (
                                    <span key={label} className="label-chip">
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="kanban-card-foot">
                                <div className="inline-actions" style={{ gap: ".45rem" }}>
                                  <UserAvatar user={task.assignee} size="sm" />
                                  <DueDateChip dueDate={task.dueDate} status={task.status} />
                                  {task.commentCount > 0 && (
                                    <span className="comment-count-chip" title={`${task.commentCount} comments`}>
                                      <MessageSquare size={12} aria-hidden="true" />
                                      {task.commentCount}
                                    </span>
                                  )}
                                </div>

                                {canEditProject && (
                                  <select
                                    aria-label={`Move ${task.identifier} status`}
                                    className="card-move-select"
                                    value={task.status}
                                    disabled={isMoving}
                                    onChange={(e) =>
                                      moveTaskStatus(task.id, e.target.value as TaskStatus)
                                    }
                                  >
                                    {TASK_STATUS_ORDER.map((s) => (
                                      <option key={s} value={s}>
                                        {TASK_STATUS_LABEL[s]}
                                      </option>
                                    ))}
                                  </select>
                                )}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="field-hint" style={{ marginTop: ".75rem" }}>
              Columns follow the selected sort order ({sortMode}). Drag cards or use the column
              selector on any card to move status.
            </p>
          </section>
        )
      ) : (
        <section className="app-card" aria-label="Task list" aria-busy={loadingList}>
          <div className="data-table-wrap task-table-desktop">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Due date</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <div className="form-stack" style={{ gap: ".3rem" }}>
                        <button
                          type="button"
                          className="task-link-row"
                          onClick={() => setActiveTaskId(task.id)}
                        >
                          <span className="project-key">{task.identifier}</span>
                          <strong title={task.title}>{task.title}</strong>
                        </button>
                        {task.labels.length > 0 && (
                          <div className="inline-actions" style={{ gap: ".3rem" }}>
                            {task.labels.slice(0, 4).map((l) => (
                              <span key={l} className="label-chip">
                                {l}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      {canEditProject && !archivedOnly ? (
                        <select
                          aria-label={`Change status for ${task.identifier}`}
                          className="field-select"
                          style={{ minHeight: "2.1rem", padding: ".25rem .5rem", width: "auto" }}
                          value={task.status}
                          disabled={movingIds.has(task.id)}
                          onChange={(e) =>
                            moveTaskStatus(task.id, e.target.value as TaskStatus)
                          }
                        >
                          {TASK_STATUS_ORDER.map((s) => (
                            <option key={s} value={s}>
                              {TASK_STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <TaskStatusBadge status={task.status} />
                      )}
                    </td>
                    <td>
                      <TaskPriorityBadge priority={task.priority} />
                    </td>
                    <td>
                      <div className="inline-actions" style={{ gap: ".45rem" }}>
                        <UserAvatar user={task.assignee} size="sm" />
                        <span style={{ fontSize: ".88rem" }}>
                          {task.assignee?.name || task.assignee?.email || "Unassigned"}
                        </span>
                      </div>
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
            {tasks.map((task) => (
              <div key={task.id} className="task-mobile-card">
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <span className="project-key">{task.identifier}</span>
                  <TaskPriorityBadge priority={task.priority} />
                </div>
                <button
                  type="button"
                  className="kanban-card-title"
                  onClick={() => setActiveTaskId(task.id)}
                >
                  {task.title}
                </button>
                <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                  <div className="inline-actions" style={{ gap: ".4rem" }}>
                    <UserAvatar user={task.assignee} size="sm" />
                    <span className="field-hint">
                      {task.assignee?.name || task.assignee?.email || "Unassigned"}
                    </span>
                  </div>
                  <TaskStatusBadge status={task.status} />
                </div>
                <DueDateChip dueDate={task.dueDate} status={task.status} />
              </div>
            ))}
          </div>
        </section>
      )}

      {createOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget && !createBusy) setCreateOpen(false);
          }}
        >
          <div
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-task-title"
          >
            <div className="app-card-header" style={{ marginBottom: 0 }}>
              <h2 id="create-task-title">Create task in {project.name}</h2>
              <button
                type="button"
                className="drawer-close-btn"
                aria-label="Close create task dialog"
                disabled={createBusy}
                onClick={() => setCreateOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="form-stack" aria-busy={createBusy}>
              <label className="field-group">
                Title
                <input
                  type="text"
                  className="field-input"
                  required
                  minLength={2}
                  maxLength={180}
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="Implement request trace header validation"
                  autoFocus
                />
              </label>

              <label className="field-group">
                Description (optional)
                <textarea
                  className="field-textarea"
                  maxLength={10000}
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  placeholder="Acceptance criteria, edge cases, or technical context…"
                />
              </label>

              <div className="field-grid">
                <label className="field-group">
                  Status
                  <select
                    className="field-select"
                    value={createStatus}
                    onChange={(e) => setCreateStatus(e.target.value as TaskStatus)}
                  >
                    {TASK_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {TASK_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group">
                  Priority
                  <select
                    className="field-select"
                    value={createPriority}
                    onChange={(e) => setCreatePriority(e.target.value as TaskPriority)}
                  >
                    {TASK_PRIORITY_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {TASK_PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="field-grid">
                <label className="field-group">
                  Assignee (optional)
                  <select
                    className="field-select"
                    value={createAssigneeId}
                    onChange={(e) => setCreateAssigneeId(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {orgMembers.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name || m.email}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-group">
                  Due date (optional)
                  <input
                    type="date"
                    className="field-input"
                    value={createDueDate}
                    onChange={(e) => setCreateDueDate(e.target.value)}
                  />
                </label>
              </div>

              <label className="field-group">
                Labels (optional)
                <input
                  type="text"
                  className="field-input mono-input"
                  value={createLabels}
                  onChange={(e) => setCreateLabels(e.target.value)}
                  placeholder="backend, api, security"
                />
                <span className="field-hint">Comma-separated tags (up to 8).</span>
              </label>

              {createError && (
                <p className="banner banner-error" role="alert">
                  <span className="inline-actions">
                    <CircleAlert size={16} />
                    {createError}
                  </span>
                </p>
              )}

              <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={createBusy}
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="compact" disabled={createBusy}>
                  {createBusy ? "Creating…" : "Create Task"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTaskId && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) requestCloseDrawer();
          }}
        >
          <aside className="task-drawer" role="dialog" aria-modal="true" aria-label="Task details">
            {loadingDetail ? (
              <div className="form-stack" style={{ padding: "1.5rem" }}>
                <div className="skeleton" style={{ height: "2.5rem", width: "50%" }} />
                <div className="skeleton" style={{ height: "9rem", width: "100%" }} />
                <div className="skeleton" style={{ height: "12rem", width: "100%" }} />
              </div>
            ) : detailError ? (
              <div className="form-stack" style={{ padding: "1.5rem" }}>
                <div className="app-card-header">
                  <h2>Task unavailable</h2>
                  <button
                    type="button"
                    className="drawer-close-btn"
                    aria-label="Close task panel"
                    onClick={() => setActiveTaskId(null)}
                  >
                    <X size={18} />
                  </button>
                </div>
                <p className="banner banner-error" role="alert">
                  {detailError}
                </p>
                <Link href={`/app/projects/${project.id}/tasks`} className="field-hint">
                  Back to project tasks
                </Link>
              </div>
            ) : activeTaskDetail ? (
              <TaskDetailView
                projectId={project.id}
                initialTask={activeTaskDetail}
                orgMembers={orgMembers}
                inDrawer
                onTaskUpdated={handleDetailUpdated}
                onCloseDrawer={requestCloseDrawer}
                onDirtyChange={setDrawerDirty}
              />
            ) : null}
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={discardConfirmOpen}
        title="Discard unsaved changes?"
        description="You have unsaved edits in this task panel. Closing now will discard them."
        confirmLabel="Discard changes"
        danger
        onConfirm={() => {
          setDiscardConfirmOpen(false);
          setDrawerDirty(false);
          setActiveTaskId(null);
        }}
        onCancel={() => setDiscardConfirmOpen(false)}
      />
    </>
  );
}
