import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  Lock,
  MessageSquare,
  ShieldAlert,
  Unlock,
} from "lucide-react";
import type {
  InternalReviewDecision,
  PullRequestState,
  RepositoryConnectionStatus,
} from "@devcollab/shared";

export const INTERNAL_DECISION_LABEL: Record<InternalReviewDecision, string> = {
  NONE: "No decision yet",
  NEEDS_DISCUSSION: "Needs discussion",
  CHANGES_SUGGESTED: "Changes suggested",
  READY_FOR_REVIEW: "Ready for review",
  INTERNALLY_APPROVED: "Internally approved",
};

export function PullRequestStateBadge({
  state,
  isDraft,
}: {
  state: PullRequestState;
  isDraft?: boolean;
}) {
  if (state === "MERGED") {
    return (
      <span className="badge badge-pr-merged">
        <GitMerge size={12} aria-hidden="true" /> Merged
      </span>
    );
  }
  if (state === "CLOSED") {
    return (
      <span className="badge badge-warm">
        <GitPullRequestClosed size={12} aria-hidden="true" /> Closed
      </span>
    );
  }
  if (isDraft) {
    return (
      <span className="badge">
        <GitPullRequestDraft size={12} aria-hidden="true" /> Draft
      </span>
    );
  }
  return (
    <span className="badge badge-accent">
      <GitPullRequest size={12} aria-hidden="true" /> Open
    </span>
  );
}

export function GitHubReviewStateBadge({ decision }: { decision: string | null }) {
  if (!decision) {
    return <span className="badge">No GitHub review</span>;
  }
  const norm = decision.toUpperCase();
  if (norm === "APPROVED") {
    return (
      <span className="badge badge-accent">
        <CheckCircle2 size={12} aria-hidden="true" /> GitHub Approved
      </span>
    );
  }
  if (norm === "CHANGES_REQUESTED") {
    return (
      <span className="badge badge-warm">
        <AlertTriangle size={12} aria-hidden="true" /> GitHub Changes Requested
      </span>
    );
  }
  return (
    <span className="badge badge-sage">
      <MessageSquare size={12} aria-hidden="true" /> GitHub {norm.toLowerCase()}
    </span>
  );
}

export function InternalReviewBadge({
  decision,
  isOutdated,
}: {
  decision: InternalReviewDecision;
  isOutdated?: boolean;
}) {
  const cls =
    decision === "INTERNALLY_APPROVED"
      ? "badge badge-accent"
      : decision === "CHANGES_SUGGESTED"
        ? "badge badge-warm"
        : decision === "READY_FOR_REVIEW"
          ? "badge badge-progress"
          : decision === "NEEDS_DISCUSSION"
            ? "badge badge-sage"
            : "badge";
  return (
    <span className="inline-actions" style={{ gap: ".35rem" }}>
      <span className={cls}>{INTERNAL_DECISION_LABEL[decision]}</span>
      {isOutdated && (
        <span className="badge badge-outdated" title="New commits pushed after this internal review">
          <Clock size={11} aria-hidden="true" /> Outdated commit
        </span>
      )}
    </span>
  );
}

export function RepoVisibilityBadge({ isPrivate }: { isPrivate: boolean }) {
  return (
    <span className="badge">
      {isPrivate ? <Lock size={11} aria-hidden="true" /> : <Unlock size={11} aria-hidden="true" />}
      {isPrivate ? "Private" : "Public"}
    </span>
  );
}

export function RepoConnectionBadge({ status }: { status: RepositoryConnectionStatus }) {
  if (status === "CONNECTED") {
    return <span className="badge badge-accent">Connected</span>;
  }
  if (status === "ACCESS_REVOKED") {
    return (
      <span className="badge badge-warm">
        <ShieldAlert size={11} aria-hidden="true" /> Access Revoked
      </span>
    );
  }
  if (status === "ERROR") {
    return (
      <span className="badge badge-warm">
        <AlertTriangle size={11} aria-hidden="true" /> Sync Error
      </span>
    );
  }
  return <span className="badge">Disconnected</span>;
}
