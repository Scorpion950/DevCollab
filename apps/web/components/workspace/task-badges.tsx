import { AlertOctagon, ArrowDown, ArrowUp, Calendar, Minus } from "lucide-react";
import type { TaskPriority, TaskStatus, TaskUserRef } from "@devcollab/shared";

export const TASK_STATUS_ORDER: TaskStatus[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "DONE",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  TODO: "Todo",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = ["URGENT", "HIGH", "MEDIUM", "LOW"];

export const TASK_PRIORITY_LABEL: Record<TaskPriority, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const cls =
    status === "DONE"
      ? "badge badge-accent"
      : status === "IN_REVIEW"
        ? "badge badge-warm"
        : status === "IN_PROGRESS"
          ? "badge badge-progress"
          : "badge";
  return <span className={cls}>{TASK_STATUS_LABEL[status]}</span>;
}

export function TaskPriorityBadge({ priority }: { priority: TaskPriority }) {
  const Icon =
    priority === "URGENT"
      ? AlertOctagon
      : priority === "HIGH"
        ? ArrowUp
        : priority === "LOW"
          ? ArrowDown
          : Minus;
  const cls =
    priority === "URGENT"
      ? "badge priority-urgent"
      : priority === "HIGH"
        ? "badge priority-high"
        : priority === "LOW"
          ? "badge priority-low"
          : "badge";
  return (
    <span className={cls}>
      <Icon size={12} aria-hidden="true" />
      {TASK_PRIORITY_LABEL[priority]}
    </span>
  );
}

export function UserAvatar({
  user,
  size = "sm",
}: {
  user: TaskUserRef | { name: string | null; email: string; image?: string | null } | null;
  size?: "sm" | "md";
}) {
  if (!user) {
    return (
      <span className={`avatar avatar-${size} avatar-unassigned`} title="Unassigned">
        ?
      </span>
    );
  }
  const label = user.name?.trim() || user.email;
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className={`avatar avatar-${size}`} title={label}>
      {user.image && /^https:\/\//.test(user.image) ? (
        // Provider avatars can come from external origins.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" referrerPolicy="no-referrer" />
      ) : (
        initials || label.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function isTaskOverdue(dueDate: string | null, status: TaskStatus): boolean {
  if (!dueDate || status === "DONE") return false;
  return new Date(dueDate).getTime() < Date.now();
}

export function DueDateChip({
  dueDate,
  status,
}: {
  dueDate: string | null;
  status: TaskStatus;
}) {
  if (!dueDate) return null;
  const overdue = isTaskOverdue(dueDate, status);
  return (
    <span className={`due-chip ${overdue ? "due-chip-overdue" : ""}`}>
      <Calendar size={12} aria-hidden="true" />
      {overdue ? "Overdue · " : ""}
      {formatShortDate(dueDate)}
    </span>
  );
}
