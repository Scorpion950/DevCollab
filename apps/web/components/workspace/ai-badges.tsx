import {
  Bot,
  CheckCircle2,
  Clock,
  FlaskConical,
  Loader2,
  PauseCircle,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type {
  AgentPlanStatus,
  AgentProposalStatus,
  AgentRunStatus,
  AgentTestRunStatus,
} from "@devcollab/shared";

export function AgentRunStatusBadge({ status }: { status: AgentRunStatus }) {
  switch (status) {
    case "QUEUED":
      return (
        <span className="badge">
          <Clock size={11} aria-hidden="true" /> Queued
        </span>
      );
    case "PLANNING":
      return (
        <span className="badge badge-progress">
          <Loader2 size={11} className="spin-icon" aria-hidden="true" /> Planning
        </span>
      );
    case "AWAITING_APPROVAL":
      return (
        <span className="badge badge-warm">
          <PauseCircle size={11} aria-hidden="true" /> Awaiting plan approval
        </span>
      );
    case "RUNNING":
      return (
        <span className="badge badge-progress">
          <Loader2 size={11} className="spin-icon" aria-hidden="true" /> Executing
        </span>
      );
    case "AWAITING_REVIEW":
      return (
        <span className="badge badge-warm">
          <Bot size={11} aria-hidden="true" /> Awaiting review
        </span>
      );
    case "COMPLETED":
      return (
        <span className="badge badge-accent">
          <CheckCircle2 size={11} aria-hidden="true" /> Accepted
        </span>
      );
    case "REJECTED":
      return (
        <span className="badge priority-urgent">
          <XCircle size={11} aria-hidden="true" /> Rejected
        </span>
      );
    case "CANCELLED":
      return (
        <span className="badge">
          <XCircle size={11} aria-hidden="true" /> Cancelled
        </span>
      );
    case "FAILED":
      return (
        <span className="badge priority-urgent">
          <ShieldAlert size={11} aria-hidden="true" /> Failed
        </span>
      );
  }
}

export function AgentPlanStatusBadge({ status }: { status: AgentPlanStatus }) {
  const cls =
    status === "APPROVED"
      ? "badge badge-accent"
      : status === "REJECTED"
        ? "badge priority-urgent"
        : status === "PENDING"
          ? "badge badge-warm"
          : "badge";
  return <span className={cls}>{status.toLowerCase()}</span>;
}

export function AgentProposalStatusBadge({ status }: { status: AgentProposalStatus }) {
  const cls =
    status === "ACCEPTED"
      ? "badge badge-accent"
      : status === "REJECTED"
        ? "badge priority-urgent"
        : status === "PENDING_REVIEW"
          ? "badge badge-warm"
          : "badge";
  return <span className={cls}>{status.replace(/_/g, " ").toLowerCase()}</span>;
}

export function AgentTestStatusBadge({ status }: { status: AgentTestRunStatus }) {
  const cls =
    status === "PASSED"
      ? "badge badge-accent"
      : status === "FAILED"
        ? "badge priority-urgent"
        : status === "UNAVAILABLE" || status === "SKIPPED"
          ? "badge badge-warm"
          : "badge";
  return (
    <span className={cls}>
      <FlaskConical size={11} aria-hidden="true" /> {status.toLowerCase()}
    </span>
  );
}

export function formatUsd(
  cost: string | number | null | undefined,
  options?: { costAvailable?: boolean; currency?: string },
): string {
  if (options?.costAvailable === false || cost === null || cost === undefined) {
    return "Cost unavailable";
  }
  const currency = options?.currency && options.currency !== "USD" ? `${options.currency} ` : "$";
  const num = Number(cost);
  if (!Number.isFinite(num)) return "Cost unavailable";
  if (num <= 0) return `${currency}0.00`;
  if (num < 0.01) return `${currency}${num.toFixed(4)}`;
  return `${currency}${num.toFixed(3)}`;
}
