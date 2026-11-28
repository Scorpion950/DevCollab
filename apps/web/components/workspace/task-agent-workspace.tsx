"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock,
  Cpu,
  FileCode2,
  FlaskConical,
  GitBranch,
  History,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  XCircle,
} from "lucide-react";
import type {
  AgentCapabilityStatusDto,
  AgentProposalDto,
  AgentRunDetailDto,
  AgentRunStatus,
  AgentRunSummaryDto,
  TaskAgentWorkspaceDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import {
  AgentPlanStatusBadge,
  AgentProposalStatusBadge,
  AgentRunStatusBadge,
  AgentTestStatusBadge,
  formatUsd,
} from "./ai-badges";
import { CodeDiffViewer } from "./code-diff-viewer";
import { formatDateTime, TaskPriorityBadge, TaskStatusBadge } from "./task-badges";

function isRunPollingStatus(status: AgentRunStatus | undefined): boolean {
  return status === "QUEUED" || status === "PLANNING" || status === "RUNNING";
}

function buildStageSteps(status: AgentRunStatus | undefined) {
  const step1Done =
    status &&
    status !== "QUEUED" &&
    status !== "PLANNING";
  const step1Active = status === "QUEUED" || status === "PLANNING";

  const step2Done =
    status === "RUNNING" ||
    status === "AWAITING_REVIEW" ||
    status === "COMPLETED";
  const step2Active = status === "AWAITING_APPROVAL";

  const step3Done = status === "AWAITING_REVIEW" || status === "COMPLETED";
  const step3Active = status === "RUNNING";

  const step4Done = status === "COMPLETED";
  const step4Active = status === "AWAITING_REVIEW";

  return [
    { key: "plan", label: "1. Plan", active: step1Active, done: Boolean(step1Done) },
    { key: "approve", label: "2. Approve Plan", active: step2Active, done: step2Done },
    { key: "execute", label: "3. Execute & Validate", active: step3Active, done: step3Done },
    { key: "review", label: "4. Human Review", active: step4Active, done: step4Done },
  ];
}

export function TaskAgentWorkspace({
  projectId,
  initialWorkspace,
}: {
  projectId: string;
  initialWorkspace: TaskAgentWorkspaceDto;
}) {
  const router = useRouter();
  const [task, setTask] = useState(initialWorkspace.task);
  const [capability, setCapability] = useState<AgentCapabilityStatusDto>(
    initialWorkspace.capability,
  );
  const [runs, setRuns] = useState<AgentRunSummaryDto[]>(initialWorkspace.runs);
  const [run, setRun] = useState<AgentRunDetailDto | null>(initialWorkspace.selectedRun);

  const [instructions, setInstructions] = useState("");
  const [baseBranch, setBaseBranch] = useState(initialWorkspace.capability.defaultBranch ?? "");
  const [starting, setStarting] = useState(false);

  const [planNote, setPlanNote] = useState("");
  const [ackStale, setAckStale] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);

  const [proposalNote, setProposalNote] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [selectedProposalId, setSelectedProposalId] = useState<string>(
    initialWorkspace.selectedRun?.activeProposal?.id ?? "",
  );

  const [actionBusy, setActionBusy] = useState(false);
  const [logsExpanded, setLogsExpanded] = useState(false);
  const [testLogsExpanded, setTestLogsExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setTask(initialWorkspace.task);
    setCapability(initialWorkspace.capability);
    setRuns(initialWorkspace.runs);
    setRun(initialWorkspace.selectedRun);
    setSelectedProposalId(initialWorkspace.selectedRun?.activeProposal?.id ?? "");
    if (!baseBranch && initialWorkspace.capability.defaultBranch) {
      setBaseBranch(initialWorkspace.capability.defaultBranch);
    }
  }, [initialWorkspace, baseBranch]);

  const activeRunId = run?.id ?? null;
  const activeRunStatus = run?.status;

  async function refreshWorkspace(targetRunId?: string | null) {
    const qs = targetRunId ? `?runId=${encodeURIComponent(targetRunId)}` : "";
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/ai-runs${qs}`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as TaskAgentWorkspaceDto;
    setTask(data.task);
    setCapability(data.capability);
    setRuns(data.runs);
    setRun(data.selectedRun);
    if (data.selectedRun?.activeProposal?.id) {
      setSelectedProposalId((prev) =>
        data.selectedRun?.proposals.some((p) => p.id === prev)
          ? prev
          : data.selectedRun?.activeProposal?.id ?? "",
      );
    }
  }

  useEffect(() => {
    if (!activeRunId || !isRunPollingStatus(activeRunStatus)) return;
    let cancelled = false;
    const poll = async () => {
      if (document.visibilityState !== "visible") return;
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/ai-runs?runId=${encodeURIComponent(activeRunId)}`,
        { cache: "no-store" },
      );
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as TaskAgentWorkspaceDto;
      if (cancelled) return;
      setTask(data.task);
      setCapability(data.capability);
      setRuns(data.runs);
      setRun(data.selectedRun);
      if (data.selectedRun?.activeProposal?.id) {
        setSelectedProposalId((prev) =>
          data.selectedRun?.proposals.some((p) => p.id === prev)
            ? prev
            : data.selectedRun?.activeProposal?.id ?? "",
        );
      }
    };
    const interval = setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeRunId, activeRunStatus, projectId, task.id]);

  async function handleStartRun(event: React.FormEvent) {
    event.preventDefault();
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/ai-runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userInstructions: instructions.trim() || undefined,
            baseBranch: baseBranch.trim() || undefined,
            idempotencyKey,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not start AI run.");
        return;
      }
      const created = data as AgentRunDetailDto;
      setRun(created);
      setInstructions("");
      setAckStale(false);
      await refreshWorkspace(created.id);
      setNotice("AI planning run queued for isolated worker execution.");
    } catch {
      setError("Network error while starting AI run.");
    } finally {
      setStarting(false);
    }
  }

  async function handlePlanDecision(decision: "APPROVE" | "REJECT" | "REVISE") {
    if (!run) return;
    if (decision === "REVISE" && !planNote.trim()) {
      setError("Please describe what should be changed in the revised plan.");
      return;
    }
    setPlanBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/runs/${encodeURIComponent(run.id)}/plan-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            note: planNote.trim() || undefined,
            acknowledgeStaleContext: ackStale,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not submit plan decision.");
        return;
      }
      setPlanNote("");
      setAckStale(false);
      setRun(data as AgentRunDetailDto);
      await refreshWorkspace(run.id);
      setNotice(
        decision === "APPROVE"
          ? "Plan approved. Execution queued for the isolated worker."
          : decision === "REVISE"
            ? "Revision feedback sent. Generating updated implementation plan."
            : "Implementation plan rejected.",
      );
    } catch {
      setError("Network error while saving plan decision.");
    } finally {
      setPlanBusy(false);
    }
  }

  async function handleProposalDecision(decision: "ACCEPT" | "REJECT" | "REVISE") {
    if (!run) return;
    if (decision === "REVISE" && !proposalNote.trim()) {
      setError("Please enter revision notes explaining the requested code changes.");
      return;
    }
    setProposalBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/runs/${encodeURIComponent(run.id)}/proposal-decision`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            decision,
            note: proposalNote.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not save proposal decision.");
        return;
      }
      setProposalNote("");
      const updated = data as AgentRunDetailDto;
      setRun(updated);
      await refreshWorkspace(updated.id);
      setNotice(
        decision === "ACCEPT"
          ? "Proposal accepted internally in DevCollab. No commits were pushed and task status remains unchanged."
          : decision === "REVISE"
            ? "Revision requested. Previous proposal preserved in history while worker generates a new revision."
            : "Proposal rejected internally.",
      );
    } catch {
      setError("Network error while saving proposal review.");
    } finally {
      setProposalBusy(false);
    }
  }

  async function handleRunControl(action: "cancel" | "retry") {
    if (!run) return;
    setActionBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/runs/${encodeURIComponent(run.id)}/${action}`,
        { method: "POST" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || `Could not ${action} AI run.`);
        return;
      }
      setRun(data as AgentRunDetailDto);
      await refreshWorkspace(run.id);
      setNotice(action === "cancel" ? "AI run cancelled." : "AI run re-queued.");
    } catch {
      setError(`Network error while attempting to ${action} run.`);
    } finally {
      setActionBusy(false);
    }
  }

  const displayedProposal: AgentProposalDto | null =
    run?.proposals.find((p) => p.id === selectedProposalId) ?? run?.activeProposal ?? null;
  const activePlan = run?.activePlan ?? null;
  const stages = buildStageSteps(run?.status);
  const canStart = capability.blockingReasons.length === 0;

  return (
    <div className="form-stack" style={{ gap: "1rem" }}>
      {error && (
        <div className="banner banner-error" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="banner banner-success" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {capability.workerStatus === "OFFLINE" && (
        <div className="banner banner-warn" role="status">
          <AlertTriangle size={16} />
          <span>
            Queued AI job has not been claimed yet — verify the separate{" "}
            <code>@devcollab/worker</code> process is running (`pnpm dev:worker`).
          </span>
        </div>
      )}

      <div className="ai-workspace-grid">
        {/* LEFT COLUMN: Task, Preflight Capability, Launcher & Context */}
        <aside className="ai-col-context form-stack" aria-label="Task and repository context">
          <section className="app-card">
            <div className="app-card-header">
              <div className="inline-actions" style={{ gap: ".45rem" }}>
                <span className="project-key">{task.identifier}</span>
                <TaskStatusBadge status={task.status} />
                <TaskPriorityBadge priority={task.priority} />
              </div>
              <Link
                href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`}
                className="text-action-link"
              >
                Task detail
              </Link>
            </div>
            <h2 style={{ fontSize: "1.02rem", marginBottom: ".45rem" }}>{task.title}</h2>
            <p className="field-hint" style={{ whiteSpace: "pre-wrap" }}>
              {task.description ? task.description.slice(0, 320) : "No task description."}
            </p>
          </section>

          <section className="app-card" aria-labelledby="ai-preflight-heading">
            <div className="app-card-header">
              <h2 id="ai-preflight-heading" className="inline-actions">
                <ShieldCheck size={16} /> Execution Preflight
              </h2>
              <button
                type="button"
                className="icon-action-btn"
                aria-label="Refresh AI status"
                onClick={() => void refreshWorkspace(run?.id)}
              >
                <RefreshCw size={13} />
              </button>
            </div>

            <dl className="meta-kv" style={{ marginBottom: ".75rem" }}>
              <div>
                <dt>Repository</dt>
                <dd>{capability.repoFullName ?? "Not connected"}</dd>
              </div>
              <div>
                <dt>AI Provider</dt>
                <dd>
                  {capability.aiConfigured
                    ? `${capability.provider} · ${capability.model}`
                    : "Not configured"}
                </dd>
              </div>
              <div>
                <dt>Docker Sandbox</dt>
                <dd>{capability.sandboxAvailable ? "Ready" : "Unavailable (safe mode)"}</dd>
              </div>
              <div>
                <dt>Worker</dt>
                <dd>{capability.workerStatus}</dd>
              </div>
            </dl>

            <p className="field-hint" style={{ marginBottom: ".65rem" }}>
              {capability.sandboxReason}
            </p>

            {capability.blockingReasons.length > 0 && (
              <div className="banner banner-warn" style={{ fontSize: ".8rem" }}>
                <ShieldAlert size={15} />
                <ul style={{ margin: 0, paddingLeft: "1rem" }}>
                  {capability.blockingReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="app-card" aria-labelledby="ai-launcher-heading">
            <div className="app-card-header">
              <h2 id="ai-launcher-heading" className="inline-actions">
                <Sparkles size={16} /> Start AI Run
              </h2>
            </div>

            <form onSubmit={handleStartRun} className="form-stack">
              <label className="field-group">
                Target base branch
                <input
                  type="text"
                  className="field-input mono-input"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder={capability.defaultBranch ?? "main"}
                  disabled={starting || !canStart}
                />
              </label>

              <label className="field-group">
                Implementation guidance (optional)
                <textarea
                  className="field-textarea"
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="Constraints, edge cases, or files to prioritize…"
                  maxLength={2000}
                  disabled={starting || !canStart}
                />
              </label>

              <Button type="submit" size="compact" disabled={starting || !canStart}>
                {starting ? (
                  <>
                    <Loader2 size={14} className="spin-icon" /> Queuing…
                  </>
                ) : (
                  <>
                    <Play size={14} /> Run with AI
                  </>
                )}
              </Button>
            </form>
          </section>

          <section className="app-card" aria-labelledby="ai-runs-history-heading">
            <div className="app-card-header">
              <h2 id="ai-runs-history-heading" className="inline-actions">
                <History size={16} /> Task AI Runs ({runs.length})
              </h2>
            </div>

            {runs.length === 0 ? (
              <p className="field-hint">No AI runs recorded for this task yet.</p>
            ) : (
              <div className="form-stack" style={{ gap: ".45rem" }}>
                {runs.map((item) => {
                  const selected = item.id === run?.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`ai-run-list-item ${selected ? "ai-run-list-item-active" : ""}`}
                      onClick={() => {
                        router.replace(
                          `/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/agent?runId=${encodeURIComponent(item.id)}`,
                        );
                        void refreshWorkspace(item.id);
                      }}
                    >
                      <div className="inline-actions" style={{ justifyContent: "space-between", width: "100%" }}>
                        <AgentRunStatusBadge status={item.status} />
                        <span className="field-hint" style={{ fontFamily: "var(--mono-font)", fontSize: ".72rem" }}>
                          {item.baseCommitSha ? item.baseCommitSha.slice(0, 7) : item.baseBranch}
                        </span>
                      </div>
                      <div className="inline-actions" style={{ justifyContent: "space-between", width: "100%" }}>
                        <small>{formatDateTime(item.createdAt)}</small>
                        <small>{item.usageTotals.totalTokens.toLocaleString()} tok</small>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {activePlan && (
            <section className="app-card" aria-labelledby="ai-context-files-heading">
              <div className="app-card-header">
                <h2 id="ai-context-files-heading" className="inline-actions">
                  <FileCode2 size={16} /> Inspected Repo Context
                </h2>
                <span className="badge">
                  {activePlan.contextSummary.selectedFiles.length} /{" "}
                  {activePlan.contextSummary.indexedFileCount}
                </span>
              </div>
              <p className="field-hint" style={{ marginBottom: ".5rem" }}>
                <GitBranch size={12} style={{ display: "inline", verticalAlign: "-2px" }} />{" "}
                <code>{activePlan.contextSummary.baseBranch}</code> @{" "}
                <code>{activePlan.contextSummary.baseCommitSha?.slice(0, 7) ?? "head"}</code>
              </p>
              {activePlan.contextSummary.excludedReasonSummary && (
                <p className="field-hint" style={{ marginBottom: ".6rem" }}>
                  {activePlan.contextSummary.excludedReasonSummary}
                </p>
              )}
              <ul className="ai-context-file-list">
                {activePlan.contextSummary.selectedFiles.map((f) => (
                  <li key={f.path}>
                    <span className="truncate-text mono-text">{f.path}</span>
                    <small>
                      {(f.bytes / 1024).toFixed(1)}KB{f.truncated ? " · clipped" : ""}
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>

        {/* CENTER COLUMN: Timeline, Plan Review Gate, Test Sandbox, Usage & Logs */}
        <section className="ai-col-stage form-stack" aria-label="Agent workflow and plan verification">
          {!run ? (
            <div className="empty-panel">
              <Bot size={28} />
              <h3>Ready for AI Planning</h3>
              <p>
                Click <strong>Run with AI</strong> on the left to inspect repository context and
                generate a step-by-step implementation plan for human approval.
              </p>
            </div>
          ) : (
            <>
              <section className="app-card">
                <div className="app-card-header" style={{ flexWrap: "wrap", gap: ".6rem" }}>
                  <div className="inline-actions" style={{ gap: ".55rem" }}>
                    <AgentRunStatusBadge status={run.status} />
                    <span className="field-hint">
                      {run.provider} · <code>{run.model}</code>
                    </span>
                    {run.currentStage && (
                      <span className="badge">{run.currentStage.replace(/_/g, " ").toLowerCase()}</span>
                    )}
                  </div>

                  {run.canControlRun && (
                    <div className="inline-actions" style={{ gap: ".45rem" }}>
                      {run.status === "FAILED" && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="compact"
                          disabled={actionBusy}
                          onClick={() => void handleRunControl("retry")}
                        >
                          <RotateCcw size={13} /> Retry
                        </Button>
                      )}
                      {["QUEUED", "PLANNING", "AWAITING_APPROVAL", "RUNNING", "AWAITING_REVIEW"].includes(
                        run.status,
                      ) && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="compact"
                          disabled={actionBusy}
                          onClick={() => void handleRunControl("cancel")}
                        >
                          <XCircle size={13} /> Cancel run
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="ai-stage-stepper" role="list" aria-label="AI workflow stages">
                  {stages.map((st) => (
                    <div
                      key={st.key}
                      role="listitem"
                      className={`ai-stage-step ${st.done ? "is-done" : ""} ${st.active ? "is-active" : ""}`}
                    >
                      {st.label}
                    </div>
                  ))}
                </div>

                {run.status === "FAILED" && run.errorMessage && (
                  <div className="banner banner-error" style={{ marginTop: ".75rem" }} role="alert">
                    <ShieldAlert size={16} />
                    <span>
                      {run.errorCode ? `[${run.errorCode}] ` : ""}
                      {run.errorMessage}
                    </span>
                  </div>
                )}

                {run.isStaleContext && (
                  <div className="banner banner-warn" style={{ marginTop: ".75rem" }} role="status">
                    <AlertTriangle size={16} />
                    <span>
                      <strong>Stale baseline context:</strong> {run.staleReason}
                    </span>
                  </div>
                )}
              </section>

              {/* PLAN SECTION */}
              <section className="app-card" aria-labelledby="ai-plan-heading">
                <div className="app-card-header">
                  <h2 id="ai-plan-heading" className="inline-actions">
                    <Cpu size={17} /> Implementation Plan{" "}
                    {activePlan ? `v${activePlan.version}` : ""}
                  </h2>
                  {activePlan && <AgentPlanStatusBadge status={activePlan.status} />}
                </div>

                {!activePlan ? (
                  <p className="field-hint">
                    {isRunPollingStatus(run.status)
                      ? "Collecting bounded repository context and generating structured plan…"
                      : "No implementation plan generated."}
                  </p>
                ) : (
                  <div className="form-stack" style={{ gap: ".85rem" }}>
                    <p style={{ margin: 0 }}>{activePlan.summary}</p>

                    {activePlan.revisionFeedback && (
                      <div className="banner banner-neutral" style={{ fontSize: ".82rem" }}>
                        <span>Revision feedback addressed: {activePlan.revisionFeedback}</span>
                      </div>
                    )}

                    <ol className="ai-plan-steps">
                      {activePlan.steps.map((step) => (
                        <li key={`${step.order}-${step.title}`}>
                          <strong>
                            {step.order}. {step.title}
                          </strong>
                          {step.rationale && <p className="field-hint">{step.rationale}</p>}
                          {step.targetFiles.length > 0 && (
                            <div className="inline-actions" style={{ gap: ".35rem", marginTop: ".25rem", flexWrap: "wrap" }}>
                              {step.targetFiles.map((tf) => (
                                <code key={tf} className="label-chip">
                                  {tf}
                                </code>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>

                    {activePlan.risks.length > 0 && (
                      <div>
                        <strong style={{ fontSize: ".84rem" }}>Identified Risks & Edge Cases</strong>
                        <ul className="ai-bullet-list">
                          {activePlan.risks.map((risk, idx) => (
                            <li key={idx}>{risk}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {activePlan.suggestedChecks.length > 0 && (
                      <div className="inline-actions" style={{ gap: ".4rem", flexWrap: "wrap" }}>
                        <span className="field-hint">Suggested checks:</span>
                        {activePlan.suggestedChecks.map((chk) => (
                          <code key={chk} className="label-chip">
                            {chk}
                          </code>
                        ))}
                      </div>
                    )}

                    {run.status === "AWAITING_APPROVAL" && run.canControlRun && (
                      <div className="ai-gate-box">
                        <strong>Human Approval Required Before Code Execution</strong>
                        {run.isStaleContext && (
                          <label className="inline-actions" style={{ gap: ".45rem", fontSize: ".83rem" }}>
                            <input
                              type="checkbox"
                              checked={ackStale}
                              onChange={(e) => setAckStale(e.target.checked)}
                            />
                            Acknowledge stale task context and approve plan anyway
                          </label>
                        )}
                        <textarea
                          className="field-textarea"
                          placeholder="Optional decision note (required if requesting a revised plan)…"
                          value={planNote}
                          onChange={(e) => setPlanNote(e.target.value)}
                          maxLength={2000}
                        />
                        <div className="inline-actions" style={{ gap: ".5rem", flexWrap: "wrap" }}>
                          <Button
                            type="button"
                            size="compact"
                            disabled={planBusy || (run.isStaleContext && !ackStale)}
                            onClick={() => void handlePlanDecision("APPROVE")}
                          >
                            <CheckCircle2 size={14} /> Approve plan &amp; execute
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={planBusy}
                            onClick={() => void handlePlanDecision("REVISE")}
                          >
                            <RefreshCw size={13} /> Request revised plan
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={planBusy}
                            onClick={() => void handlePlanDecision("REJECT")}
                          >
                            <XCircle size={13} /> Reject plan
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* TEST / SANDBOX RESULTS */}
              <section className="app-card" aria-labelledby="ai-tests-heading">
                <div className="app-card-header">
                  <h2 id="ai-tests-heading" className="inline-actions">
                    <FlaskConical size={16} /> Verification &amp; Sandbox Checks
                  </h2>
                  {run.testRuns[0] && <AgentTestStatusBadge status={run.testRuns[0].status} />}
                </div>

                {run.testRuns.length === 0 ? (
                  <p className="field-hint">
                    Verification checks run automatically inside an isolated Docker container (when
                    available) after plan approval.
                  </p>
                ) : (
                  <div className="form-stack" style={{ gap: ".65rem" }}>
                    {run.testRuns.map((tr) => (
                      <div key={tr.id} className="ai-test-card">
                        <div className="inline-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                          <div className="inline-actions" style={{ gap: ".45rem" }}>
                            <AgentTestStatusBadge status={tr.status} />
                            {tr.command && <code>{tr.command}</code>}
                          </div>
                          {tr.durationMs !== null && (
                            <small className="field-hint">
                              {tr.durationMs}ms · exit {tr.exitCode ?? "—"}
                            </small>
                          )}
                        </div>
                        <p className="field-hint" style={{ marginTop: ".35rem" }}>
                          {tr.explanation}
                        </p>
                        {(tr.stdoutExcerpt || tr.stderrExcerpt) && (
                          <div style={{ marginTop: ".45rem" }}>
                            <button
                              type="button"
                              className="text-action-link inline-actions"
                              onClick={() => setTestLogsExpanded((v) => !v)}
                            >
                              {testLogsExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              {testLogsExpanded ? "Hide sandbox output" : "Show sandbox output"}
                            </button>
                            {testLogsExpanded && (
                              <pre className="ai-log-pre">
                                {[tr.stdoutExcerpt, tr.stderrExcerpt].filter(Boolean).join("\n---\n")}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* AI USAGE & COST TELEMETRY */}
              <section className="app-card" aria-labelledby="ai-usage-heading">
                <div className="app-card-header">
                  <h2 id="ai-usage-heading" className="inline-actions">
                    <Clock size={16} /> Model Usage &amp; Cost Telemetry
                  </h2>
                  <span className="badge">
                    {run.usageTotals.totalTokens.toLocaleString()} tokens ·{" "}
                    {formatUsd(run.usageTotals.estimatedCostUsd)}
                  </span>
                </div>

                {run.usageRecords.length === 0 ? (
                  <p className="field-hint">No model calls recorded yet.</p>
                ) : (
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Stage</th>
                          <th>Model</th>
                          <th>Input / Output</th>
                          <th>Latency</th>
                          <th>Est. Cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.usageRecords.map((u) => (
                          <tr key={u.id}>
                            <td>
                              <span className="badge">{u.stageRole.toLowerCase()}</span>
                            </td>
                            <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                              {u.model}
                            </td>
                            <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                              {u.inputTokens.toLocaleString()} / {u.outputTokens.toLocaleString()}
                            </td>
                            <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                              {u.latencyMs}ms
                            </td>
                            <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                              {formatUsd(u.estimatedCostUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* COLLAPSIBLE AUDIT / EVENT LOG */}
              <section className="app-card" aria-labelledby="ai-events-heading">
                <div className="app-card-header">
                  <button
                    type="button"
                    className="inline-actions text-action-link"
                    onClick={() => setLogsExpanded((v) => !v)}
                    aria-expanded={logsExpanded}
                  >
                    {logsExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                    <TerminalSquare size={16} />
                    <span id="ai-events-heading" style={{ fontWeight: 600 }}>
                      Execution Timeline &amp; Audit Events ({run.events.length})
                    </span>
                  </button>
                </div>

                {logsExpanded && (
                  <ul className="activity-list" style={{ marginTop: ".5rem" }}>
                    {run.events.map((ev) => (
                      <li key={ev.id} className="activity-item">
                        <p>
                          <span className="badge" style={{ marginRight: ".4rem" }}>
                            {ev.eventType.replace(/_/g, " ").toLowerCase()}
                          </span>
                          {ev.message}
                        </p>
                        <small>
                          {ev.actor?.name || ev.actor?.email || "Worker"} ·{" "}
                          {formatDateTime(ev.createdAt)}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </section>

        {/* RIGHT COLUMN: Code Proposal Revisions, Reviewer Findings, Accept/Reject & Diff Viewer */}
        <section className="ai-col-review form-stack" aria-label="Proposed code changes and human review">
          {!run || run.proposals.length === 0 ? (
            <section className="app-card">
              <div className="empty-panel">
                <FileCode2 size={26} />
                <h3>Proposed Changes</h3>
                <p>
                  {run?.status === "AWAITING_APPROVAL"
                    ? "Approve the implementation plan to trigger patch generation and AI code review."
                    : run && isRunPollingStatus(run.status)
                      ? "Generating code changes and running automated verification…"
                      : "Code proposals and interactive unified/side-by-side diffs appear here once execution completes."}
                </p>
              </div>
            </section>
          ) : (
            <>
              <section className="app-card">
                <div className="app-card-header" style={{ flexWrap: "wrap", gap: ".5rem" }}>
                  <div className="inline-actions" style={{ gap: ".5rem" }}>
                    <h2 style={{ margin: 0 }}>
                      Code Proposal v{displayedProposal?.version ?? 1}
                    </h2>
                    {displayedProposal && (
                      <AgentProposalStatusBadge status={displayedProposal.status} />
                    )}
                  </div>

                  {run.proposals.length > 1 && (
                    <div className="inline-actions" style={{ gap: ".35rem" }}>
                      {run.proposals.map((prop) => (
                        <button
                          key={prop.id}
                          type="button"
                          className={`badge ${prop.id === displayedProposal?.id ? "badge-accent" : ""}`}
                          onClick={() => setSelectedProposalId(prop.id)}
                        >
                          v{prop.version}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {displayedProposal && (
                  <div className="form-stack" style={{ gap: ".75rem" }}>
                    <p style={{ margin: 0 }}>{displayedProposal.summary}</p>
                    <div className="inline-actions" style={{ gap: ".5rem", flexWrap: "wrap" }}>
                      <span className="badge">
                        {displayedProposal.filesChangedCount} files changed
                      </span>
                      <span className="badge badge-accent">
                        +{displayedProposal.additionsCount}
                      </span>
                      <span className="badge priority-urgent">
                        -{displayedProposal.deletionsCount}
                      </span>
                      <span className="badge">
                        Base <code>{displayedProposal.baseCommitSha.slice(0, 7)}</code>
                      </span>
                    </div>

                    <div className="ai-review-card">
                      <strong>Reviewer Agent Summary</strong>
                      <p className="field-hint" style={{ marginTop: ".25rem" }}>
                        {displayedProposal.reviewSummary}
                      </p>
                      {displayedProposal.reviewFindings.length > 0 && (
                        <ul className="ai-findings-list">
                          {displayedProposal.reviewFindings.map((finding, idx) => (
                            <li key={idx}>
                              <span
                                className={`badge ${
                                  finding.severity === "CRITICAL"
                                    ? "priority-urgent"
                                    : finding.severity === "WARNING"
                                      ? "badge-warm"
                                      : ""
                                }`}
                              >
                                {finding.severity}
                              </span>
                              {finding.file && <code>{finding.file}</code>}
                              <span>{finding.message}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {run.status === "AWAITING_REVIEW" &&
                      displayedProposal.id === run.activeProposal?.id && (
                        <div style={{ marginTop: ".25rem" }}>
                          <Button asChild variant="secondary" size="compact">
                            <Link
                              href={`/app/projects/${encodeURIComponent(projectId)}/ide?taskId=${encodeURIComponent(task.id)}&proposalId=${encodeURIComponent(displayedProposal.id)}`}
                            >
                              <FileCode2 size={13} /> Open &amp; Apply in Browser IDE
                            </Link>
                          </Button>
                        </div>
                      )}

                    {run.status === "AWAITING_REVIEW" &&
                      displayedProposal.id === run.activeProposal?.id &&
                      run.canControlRun && (
                        <div className="ai-gate-box">
                          <strong>Internal DevCollab Review Decision</strong>
                          <p className="field-hint" style={{ margin: 0 }}>
                            Accepting marks this proposal approved inside DevCollab only — it never
                            auto-completes the task or pushes commits/PRs to GitHub.
                          </p>
                          <textarea
                            className="field-textarea"
                            placeholder="Review notes (required if requesting changes)…"
                            value={proposalNote}
                            onChange={(e) => setProposalNote(e.target.value)}
                            maxLength={2000}
                          />
                          <div className="inline-actions" style={{ gap: ".5rem", flexWrap: "wrap" }}>
                            <Button
                              type="button"
                              size="compact"
                              disabled={proposalBusy}
                              onClick={() => void handleProposalDecision("ACCEPT")}
                            >
                              <CheckCircle2 size={14} /> Accept internally
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={proposalBusy}
                              onClick={() => void handleProposalDecision("REVISE")}
                            >
                              <RefreshCw size={13} /> Request revision
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={proposalBusy}
                              onClick={() => void handleProposalDecision("REJECT")}
                            >
                              <XCircle size={13} /> Reject proposal
                            </Button>
                          </div>
                        </div>
                      )}
                  </div>
                )}
              </section>

              {displayedProposal && (
                <CodeDiffViewer
                  files={displayedProposal.changedFiles}
                  truncatedResponse={false}
                  comments={[]}
                  canReview={false}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
