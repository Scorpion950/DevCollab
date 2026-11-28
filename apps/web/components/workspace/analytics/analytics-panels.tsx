"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  GitPullRequest,
  History,
  Info,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import type {
  AiBudgetAuditEventDto,
  AiBudgetStatusDto,
  AiExecutionAnalyticsDto,
  AiModelPricingDto,
  AiUsageAnalyticsDto,
  AnalyticsComparisonDto,
  GitHubAnalyticsDto,
  TaskDeliveryAnalyticsDto,
  TaskHealthInsightDto,
  TaskLifecycleAnalyticsDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import {
  AiActivityTrendChart,
  DeliveryTrendChart,
  StatusDistributionBar,
} from "./analytics-charts";
import { formatDateTime, TaskStatusBadge } from "../task-badges";

export function formatNullableTokens(value: number | null): string {
  if (value === null) return "Unavailable";
  return value.toLocaleString();
}

export function formatMoneyAmount(
  amount: string | null,
  currency: string = "USD",
): string {
  if (amount === null) return "Cost estimate unavailable.";
  const num = Number(amount);
  if (!Number.isFinite(num)) return "Cost estimate unavailable.";
  const prefix = currency === "USD" ? "$" : `${currency} `;
  if (num > 0 && num < 0.01) return `${prefix}${num.toFixed(4)}`;
  return `${prefix}${num.toFixed(2)}`;
}

export function ComparisonNote({ comparison }: { comparison: AnalyticsComparisonDto }) {
  if (comparison.state === "UNAVAILABLE") {
    return <span className="field-hint">Comparison unavailable</span>;
  }
  if (comparison.state === "ZERO_BASELINE") {
    return (
      <span className="field-hint">
        Prior period: 0 (no baseline % calculated)
      </span>
    );
  }
  const sign = (comparison.deltaPct ?? 0) > 0 ? "+" : "";
  return (
    <span className="field-hint">
      {sign}
      {comparison.deltaPct}% vs prior ({comparison.previous})
    </span>
  );
}

export function TaskDeliverySection({ delivery }: { delivery: TaskDeliveryAnalyticsDto }) {
  return (
    <section className="analytics-stack" aria-labelledby="delivery-analytics-heading">
      <div className="app-card">
        <div className="app-card-header">
          <h2 id="delivery-analytics-heading" className="inline-actions">
            <TrendingUp size={17} /> Task Delivery &amp; Backlog Health
          </h2>
          <span className="badge">Archived excluded ({delivery.archivedTasks} archived)</span>
        </div>

        <dl className="stat-grid">
          <div className="stat-card">
            <dt>Active Backlog</dt>
            <dd>{delivery.activeTasks}</dd>
            <span className="field-hint">{delivery.tasksInReview} currently in review</span>
          </div>
          <div className="stat-card">
            <dt>Created in Period</dt>
            <dd>{delivery.createdInPeriod}</dd>
            <ComparisonNote comparison={delivery.createdComparison} />
          </div>
          <div className="stat-card">
            <dt>Completed in Period</dt>
            <dd>{delivery.completedInPeriod}</dd>
            <ComparisonNote comparison={delivery.completedComparison} />
          </div>
          <div className="stat-card">
            <dt>Overdue Open</dt>
            <dd style={delivery.overdueTasks > 0 ? { color: "var(--warm-ink)" } : undefined}>
              {delivery.overdueTasks}
            </dd>
            <span className="field-hint">{delivery.totalNonArchivedTasks} non-archived total</span>
          </div>
        </dl>

        <p className="field-hint" style={{ marginTop: ".85rem" }}>
          {delivery.archiveRuleNote}
        </p>
      </div>

      <div className="panel-grid">
        <div className="app-card">
          <div className="app-card-header">
            <h3>Status Distribution</h3>
          </div>
          <StatusDistributionBar
            items={delivery.statusDistribution}
            total={delivery.totalNonArchivedTasks}
          />
        </div>
        <div className="app-card">
          <div className="app-card-header">
            <h3>Created vs Completed Trend</h3>
          </div>
          <DeliveryTrendChart points={delivery.trends} />
        </div>
      </div>
    </section>
  );
}

export function TaskLifecycleSection({
  lifecycle,
}: {
  lifecycle: TaskLifecycleAnalyticsDto;
}) {
  return (
    <section className="app-card" aria-labelledby="lifecycle-heading">
      <div className="app-card-header">
        <h2 id="lifecycle-heading" className="inline-actions">
          <Clock size={17} /> Cycle Time, Lead Time &amp; Throughput
        </h2>
        <span className="badge">
          {lifecycle.reopenedInPeriodCount} reopened in period
        </span>
      </div>

      <dl className="stat-grid">
        <div className="stat-card">
          <dt>Completed Throughput</dt>
          <dd>{lifecycle.throughputCount}</dd>
          <span className="field-hint">Tasks completed in selected window</span>
        </div>
        <div className="stat-card">
          <dt>Avg Cycle Time</dt>
          <dd>
            {lifecycle.averageCycleTimeHours !== null
              ? `${lifecycle.averageCycleTimeHours.toFixed(1)}h`
              : "N/A"}
          </dd>
          <span className="field-hint">
            {lifecycle.cycleTimeStatus === "AVAILABLE"
              ? `Median ${lifecycle.medianCycleTimeHours?.toFixed(1)}h · ${lifecycle.cycleTimeSampleCount} task(s) with In Progress history`
              : "Insufficient In Progress activity history"}
          </span>
        </div>
        <div className="stat-card">
          <dt>Avg Lead Time</dt>
          <dd>
            {lifecycle.averageLeadTimeHours !== null
              ? `${lifecycle.averageLeadTimeHours.toFixed(1)}h`
              : "N/A"}
          </dd>
          <span className="field-hint">
            {lifecycle.leadTimeStatus === "AVAILABLE"
              ? `Median ${lifecycle.medianLeadTimeHours?.toFixed(1)}h · ${lifecycle.leadTimeSampleCount} completed task(s)`
              : "No completed tasks in selected window"}
          </span>
        </div>
        <div className="stat-card">
          <dt>Cycle Excluded</dt>
          <dd>{lifecycle.cycleTimeExcludedCount}</dd>
          <span className="field-hint">Completed without In Progress transition</span>
        </div>
      </dl>

      <p className="field-hint" style={{ marginTop: ".85rem" }}>
        {lifecycle.cycleTimeRuleNote}
      </p>
    </section>
  );
}

export function TaskHealthSection({
  insights,
  projectId,
}: {
  insights: TaskHealthInsightDto[];
  projectId: string;
}) {
  return (
    <section className="app-card" aria-labelledby="task-health-heading">
      <div className="app-card-header">
        <h2 id="task-health-heading" className="inline-actions">
          <AlertTriangle size={17} /> Factual Queue &amp; Delivery Signals
        </h2>
        <span className="field-hint">Queue-level inspection only — no contributor ranking</span>
      </div>

      <div className="analytics-health-grid">
        {insights.map((bucket) => (
          <div key={bucket.key} className="analytics-health-card">
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <strong>{bucket.label}</strong>
              <span
                className={
                  bucket.count > 0 && bucket.key === "OVERDUE"
                    ? "badge badge-warm"
                    : "badge"
                }
              >
                {bucket.count}
              </span>
            </div>
            <p className="field-hint" style={{ fontSize: ".8rem" }}>
              {bucket.summary}
            </p>
            {bucket.tasks.length === 0 ? (
              <p className="field-hint" style={{ fontSize: ".78rem" }}>
                None currently flagged.
              </p>
            ) : (
              <ul className="analytics-compact-list">
                {bucket.tasks.slice(0, 5).map((task) => (
                  <li key={task.id}>
                    <Link
                      href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}`}
                      className="text-action-link"
                    >
                      <span className="project-key">{task.identifier}</span> {task.title}
                    </Link>
                    <TaskStatusBadge status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function GitHubMetricsSection({ github }: { github: GitHubAnalyticsDto }) {
  const isWarning =
    github.state === "NOT_CONNECTED" ||
    github.state === "NOT_YET_SYNCHRONIZED" ||
    github.state === "STALE_SYNC" ||
    github.state === "SYNC_ERROR";

  return (
    <section className="app-card" aria-labelledby="github-analytics-heading">
      <div className="app-card-header">
        <h2 id="github-analytics-heading" className="inline-actions">
          <GitPullRequest size={17} /> GitHub Pull Request Metrics
        </h2>
        <span className={isWarning ? "badge badge-warm" : "badge badge-accent"}>
          {github.state.replace(/_/g, " ")}
        </span>
      </div>

      <div className={isWarning ? "banner banner-warn" : "banner banner-neutral"} style={{ marginBottom: "1rem" }}>
        <Info size={15} />
        <div>
          <span>{github.statusMessage}</span>
          {github.lastSyncedAt && (
            <span className="field-hint" style={{ display: "block", fontSize: ".78rem" }}>
              Last synced: {formatDateTime(github.lastSyncedAt)}
            </span>
          )}
        </div>
      </div>

      {github.state !== "NOT_CONNECTED" && (
        <>
          <dl className="stat-grid">
            <div className="stat-card">
              <dt>Open PRs</dt>
              <dd>{github.openPullRequests}</dd>
              <span className="field-hint">{github.draftPullRequests} draft</span>
            </div>
            <div className="stat-card">
              <dt>Merged in Period</dt>
              <dd>{github.mergedInPeriod}</dd>
              <span className="field-hint">{github.closedInPeriod} closed unmerged</span>
            </div>
            <div className="stat-card">
              <dt>GitHub Review Needed</dt>
              <dd>{github.githubAwaitingReviewCount}</dd>
              <span className="field-hint">
                {github.internallyApprovedCount} open internally approved
              </span>
            </div>
            <div className="stat-card">
              <dt>Avg Merge Time</dt>
              <dd>
                {github.averageMergeTimeHours !== null
                  ? `${github.averageMergeTimeHours.toFixed(1)}h`
                  : "N/A"}
              </dd>
              <span className="field-hint">
                {github.mergeTimeSampleCount > 0
                  ? `${github.mergeTimeSampleCount} merged PR sample(s)`
                  : "No merged PRs in period"}
              </span>
            </div>
          </dl>
          <p className="field-hint" style={{ marginTop: ".85rem" }}>
            {github.reviewBoundaryNote}
          </p>
        </>
      )}
    </section>
  );
}

export function AiExecutionSection({
  execution,
  usageTrends,
}: {
  execution: AiExecutionAnalyticsDto;
  usageTrends: AiUsageAnalyticsDto["trends"];
}) {
  return (
    <section className="app-card" aria-labelledby="ai-exec-heading">
      <div className="app-card-header">
        <h2 id="ai-exec-heading" className="inline-actions">
          <Bot size={17} /> AI Agent Execution &amp; Validation Accuracy
        </h2>
        <span className="badge">{execution.totalRuns} run(s) initiated</span>
      </div>

      <dl className="stat-grid" style={{ marginBottom: "1rem" }}>
        <div className="stat-card">
          <dt>Run Outcomes</dt>
          <dd>
            {execution.runSuccessRatePct !== null ? `${execution.runSuccessRatePct}%` : "N/A"}
          </dd>
          <span className="field-hint">
            {execution.completedRuns} completed · {execution.failedRuns} failed ·{" "}
            {execution.cancelledRuns} cancelled
          </span>
        </div>
        <div className="stat-card">
          <dt>Proposals Accepted</dt>
          <dd>
            {execution.proposalsAcceptedCount} / {execution.proposalsGeneratedCount}
          </dd>
          <span className="field-hint">
            {execution.plansGeneratedCount} plan(s) · {execution.awaitingApprovalRuns} awaiting plan approval
          </span>
        </div>
        <div className="stat-card">
          <dt>Sandboxed Tests Passed</dt>
          <dd>
            {execution.testsPassedCount} / {execution.testsExecutedCount}
          </dd>
          <span className="field-hint">
            {execution.testsUnavailableCount} unavailable/skipped
          </span>
        </div>
        <div className="stat-card">
          <dt>Avg Run Duration</dt>
          <dd>
            {execution.averageCompletedDurationSeconds !== null
              ? `${execution.averageCompletedDurationSeconds.toFixed(1)}s`
              : "N/A"}
          </dd>
          <span className="field-hint">
            {execution.awaitingReviewRuns} awaiting review · {execution.runningOrQueuedRuns} active
          </span>
        </div>
      </dl>

      <AiActivityTrendChart
        executionTrends={execution.trends}
        usageTrends={usageTrends}
      />
      <p className="field-hint" style={{ marginTop: ".75rem" }}>
        {execution.accuracyNote}
      </p>
    </section>
  );
}

export function AiUsageCostSection({
  usage,
  canViewCostDetails = true,
  showProjectBreakdown = true,
  onPageChange,
}: {
  usage: AiUsageAnalyticsDto;
  canViewCostDetails?: boolean;
  showProjectBreakdown?: boolean;
  onPageChange?: (page: number) => void;
}) {
  const [groupTab, setGroupTab] = useState<"model" | "project" | "operation">("model");

  const activeRows =
    groupTab === "model"
      ? usage.byModel
      : groupTab === "project"
        ? usage.byProject
        : usage.byOperation;

  const totalPages = Math.max(1, Math.ceil(usage.activityTotalCount / usage.pageSize));

  return (
    <section className="analytics-stack" aria-labelledby="ai-usage-analytics-heading">
      <div className="app-card">
        <div className="app-card-header">
          <h2 id="ai-usage-analytics-heading" className="inline-actions">
            <Cpu size={17} /> AI Token Usage &amp; Estimated Spend
          </h2>
          <span
            className={
              usage.costStatus === "AVAILABLE"
                ? "badge badge-accent"
                : usage.costStatus === "NO_USAGE"
                  ? "badge"
                  : "badge badge-warm"
            }
          >
            {usage.costStatus.replace(/_/g, " ")}
          </span>
        </div>

        <dl className="stat-grid" style={{ marginBottom: "1rem" }}>
          <div className="stat-card">
            <dt>AI Requests</dt>
            <dd>{usage.totalRequests}</dd>
            <span className="field-hint">
              {usage.reportedCallCount} reported tokens · {usage.unreportedCallCount} unreported
            </span>
          </div>
          <div className="stat-card">
            <dt>Reported Tokens</dt>
            <dd>{formatNullableTokens(usage.totalTokens)}</dd>
            <span className="field-hint">
              {usage.totalTokens !== null
                ? `${formatNullableTokens(usage.totalInputTokens)} in / ${formatNullableTokens(usage.totalOutputTokens)} out`
                : usage.tokenUsageStatus === "NO_USAGE"
                  ? "No requests in window"
                  : "Provider omitted usage"}
            </span>
          </div>
          <div className="stat-card">
            <dt>Most Used Model</dt>
            <dd style={{ fontSize: "1.1rem", overflowWrap: "anywhere" }}>
              {usage.mostUsedModel ?? "None"}
            </dd>
            <span className="field-hint">Top request volume in period</span>
          </div>
          <div className="stat-card">
            <dt>Estimated Spend</dt>
            {!canViewCostDetails ? (
              <>
                <dd style={{ fontSize: "1.1rem" }}>Restricted</dd>
                <span className="field-hint">Team spend totals hidden for this role</span>
              </>
            ) : usage.spendByCurrency.filter((c) => c.costedCallCount > 0).length === 0 ? (
              <>
                <dd style={{ fontSize: "1.1rem" }}>Unavailable</dd>
                <span className="field-hint">Cost estimate unavailable.</span>
              </>
            ) : (
              <>
                <dd style={{ fontSize: "1.35rem" }}>
                  {usage.spendByCurrency
                    .filter((c) => c.costedCallCount > 0)
                    .map((c) => formatMoneyAmount(c.estimatedSpend, c.currency))
                    .join(" + ")}
                </dd>
                <span className="field-hint">
                  Immutable pricing snapshot at execution time
                </span>
              </>
            )}
          </div>
        </dl>

        <div
          className={
            usage.costStatus === "PRICING_UNAVAILABLE" || usage.costStatus === "PARTIAL"
              ? "banner banner-warn"
              : "banner banner-neutral"
          }
          style={{ marginBottom: "1rem" }}
        >
          <Info size={15} />
          <span>{usage.costStatusMessage}</span>
        </div>

        <div className="inline-actions" style={{ justifyContent: "space-between", marginBottom: ".75rem" }}>
          <div className="inline-actions" role="tablist" aria-label="AI breakdown dimensions">
            <Button
              type="button"
              size="compact"
              variant={groupTab === "model" ? "primary" : "secondary"}
              onClick={() => setGroupTab("model")}
            >
              By Model
            </Button>
            {showProjectBreakdown && (
              <Button
                type="button"
                size="compact"
                variant={groupTab === "project" ? "primary" : "secondary"}
                onClick={() => setGroupTab("project")}
              >
                By Project
              </Button>
            )}
            <Button
              type="button"
              size="compact"
              variant={groupTab === "operation" ? "primary" : "secondary"}
              onClick={() => setGroupTab("operation")}
            >
              By Operation
            </Button>
          </div>
        </div>

        {activeRows.length === 0 ? (
          <p className="field-hint">No AI usage recorded in the selected time range.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Requests</th>
                  <th>Input / Output Tokens</th>
                  <th>Total Tokens</th>
                  {canViewCostDetails && <th>Est. Spend</th>}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <strong>{row.label}</strong>
                      {row.subLabel && (
                        <div className="field-hint" style={{ fontSize: ".76rem" }}>
                          {row.subLabel}
                        </div>
                      )}
                    </td>
                    <td>{row.requestCount}</td>
                    <td>
                      {row.reportedCallCount > 0
                        ? `${formatNullableTokens(row.inputTokens)} / ${formatNullableTokens(row.outputTokens)}`
                        : "Usage unavailable"}
                    </td>
                    <td>{formatNullableTokens(row.totalTokens)}</td>
                    {canViewCostDetails && (
                      <td>
                        {row.costStatus === "PRICING_UNAVAILABLE"
                          ? "Cost estimate unavailable."
                          : row.estimatedSpend === null
                            ? "Mixed currency"
                            : `${formatMoneyAmount(row.estimatedSpend, row.currency)}${row.costStatus === "PARTIAL" ? " (partial)" : ""}`}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card">
        <div className="app-card-header">
          <h3>Recent AI Activity Log</h3>
          <span className="field-hint">
            Page {usage.page} of {totalPages} ({usage.activityTotalCount} events)
          </span>
        </div>

        {usage.recentActivity.length === 0 ? (
          <p className="field-hint">No AI activity events in this period.</p>
        ) : (
          <>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Operation</th>
                    <th>Project / Context</th>
                    <th>Model</th>
                    <th>Tokens</th>
                    {canViewCostDetails && <th>Cost</th>}
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.recentActivity.map((item) => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap", fontSize: ".78rem" }}>
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td>
                        <strong>{item.operationLabel}</strong>
                        {item.actorName && (
                          <div className="field-hint" style={{ fontSize: ".74rem" }}>
                            {item.actorName}
                          </div>
                        )}
                      </td>
                      <td>
                        <span className="project-key">{item.projectKey}</span>{" "}
                        {item.taskIdentifier ? `· ${item.taskIdentifier}` : ""}
                      </td>
                      <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                        {item.provider}/{item.model}
                      </td>
                      <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                        {item.usageAvailable
                          ? `${formatNullableTokens(item.totalTokens)}`
                          : "Unavailable"}
                      </td>
                      {canViewCostDetails && (
                        <td style={{ fontFamily: "var(--mono-font)", fontSize: ".76rem" }}>
                          {item.costAvailable
                            ? formatMoneyAmount(item.estimatedCostUsd, item.currency)
                            : "Cost estimate unavailable."}
                        </td>
                      )}
                      <td>
                        <span className="badge">{item.statusLabel}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {onPageChange && totalPages > 1 && (
              <div className="inline-actions" style={{ justifyContent: "flex-end", marginTop: ".75rem" }}>
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  disabled={usage.page <= 1}
                  onClick={() => onPageChange(usage.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  disabled={usage.page >= totalPages}
                  onClick={() => onPageChange(usage.page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function BudgetStatusBanner({ status }: { status: AiBudgetStatusDto }) {
  const cls =
    status.state === "BUDGET_EXCEEDED"
      ? "banner banner-error"
      : status.state === "APPROACHING_BUDGET" ||
          status.state === "PRICING_UNAVAILABLE" ||
          status.state === "INCOMPLETE_DATA"
        ? "banner banner-warn"
        : "banner banner-neutral";

  const pctBar =
    status.consumedPct !== null ? Math.min(100, Math.max(0, status.consumedPct)) : 0;

  return (
    <div className="analytics-budget-item">
      <div className="inline-actions" style={{ justifyContent: "space-between" }}>
        <div>
          <strong>
            {status.budget.projectId
              ? `${status.budget.projectKey} · ${status.budget.projectName}`
              : "Organization-wide AI Budget"}
          </strong>
          <span className="field-hint" style={{ marginLeft: ".5rem" }}>
            {status.budget.period} · Warn at {status.budget.warningThresholdPct}%
          </span>
        </div>
        <span className="badge">Advisory only</span>
      </div>

      <div className="analytics-budget-bar" aria-hidden="true">
        <div
          style={{
            width: `${pctBar}%`,
            backgroundColor:
              status.state === "BUDGET_EXCEEDED"
                ? "var(--error)"
                : status.state === "APPROACHING_BUDGET"
                  ? "var(--warm-ink)"
                  : "var(--accent)",
          }}
        />
      </div>

      <div className="inline-actions" style={{ justifyContent: "space-between", fontSize: ".82rem" }}>
        <span>
          {status.consumedAmount !== null
            ? `${formatMoneyAmount(status.consumedAmount, status.budget.currency)} of ${formatMoneyAmount(status.budget.amountUsd, status.budget.currency)} (${status.consumedPct}%)`
            : `Budget limit: ${formatMoneyAmount(status.budget.amountUsd, status.budget.currency)} · Spend unavailable`}
        </span>
        <span className="field-hint">
          {status.costedCallCount} costed · {status.uncostedCallCount} uncosted
        </span>
      </div>

      {status.warnings.map((w, idx) => (
        <div key={idx} className={cls} style={{ padding: ".55rem .75rem", fontSize: ".82rem" }}>
          <ShieldAlert size={14} />
          <span>{w}</span>
        </div>
      ))}
    </div>
  );
}

export function ProjectBudgetCard({
  budgetStatus,
  canManageBudget,
  onSaveBudget,
}: {
  budgetStatus: AiBudgetStatusDto | null;
  canManageBudget: boolean;
  onSaveBudget: (input: {
    period: "WEEKLY" | "MONTHLY";
    currency: string;
    amountUsd: string;
    warningThresholdPct: number;
  }) => Promise<void>;
}) {
  const [period, setPeriod] = useState<"WEEKLY" | "MONTHLY">(
    budgetStatus?.budget.period ?? "MONTHLY",
  );
  const [currency, setCurrency] = useState(budgetStatus?.budget.currency ?? "USD");
  const [amountUsd, setAmountUsd] = useState(budgetStatus?.budget.amountUsd ?? "100.00");
  const [warnPct, setWarnPct] = useState(
    String(budgetStatus?.budget.warningThresholdPct ?? 80),
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!budgetStatus && !canManageBudget) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      await onSaveBudget({
        period,
        currency,
        amountUsd,
        warningThresholdPct: Number(warnPct),
      });
      setFeedback("Project advisory budget saved.");
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : "Failed to save budget.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="app-card" aria-labelledby="proj-budget-heading">
      <div className="app-card-header">
        <h2 id="proj-budget-heading" className="inline-actions">
          <ShieldAlert size={17} /> Project AI Advisory Budget
        </h2>
        <span className="field-hint">Non-blocking warning thresholds only</span>
      </div>

      {budgetStatus ? (
        <BudgetStatusBanner status={budgetStatus} />
      ) : (
        <p className="field-hint" style={{ marginBottom: ".75rem" }}>
          No project-specific AI budget threshold configured yet.
        </p>
      )}

      {canManageBudget && (
        <form onSubmit={submit} className="analytics-inline-form" style={{ marginTop: "1rem" }}>
          <select
            aria-label="Project budget period"
            className="field-select"
            value={period}
            onChange={(e) => setPeriod(e.target.value as "WEEKLY" | "MONTHLY")}
          >
            <option value="MONTHLY">Monthly (UTC)</option>
            <option value="WEEKLY">Weekly (UTC)</option>
          </select>
          <input
            aria-label="Project budget currency"
            className="field-input"
            style={{ width: "5.5rem" }}
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
          />
          <input
            aria-label="Project budget threshold amount"
            className="field-input"
            type="number"
            step="0.01"
            min="0.01"
            value={amountUsd}
            onChange={(e) => setAmountUsd(e.target.value)}
            style={{ width: "8rem" }}
          />
          <input
            aria-label="Project warning threshold percentage"
            className="field-input"
            type="number"
            min="1"
            max="100"
            value={warnPct}
            onChange={(e) => setWarnPct(e.target.value)}
            style={{ width: "6rem" }}
          />
          <Button type="submit" size="compact" disabled={saving}>
            {saving ? "Saving..." : "Save project budget"}
          </Button>
          {feedback && <span className="field-hint">{feedback}</span>}
        </form>
      )}
    </section>
  );
}

export function PricingAndBudgetManager({
  pricing,
  budgets,
  auditEvents,
  onCreatePricing,
  onSaveOrgBudget,
}: {
  pricing: AiModelPricingDto[];
  budgets: AiBudgetStatusDto[];
  auditEvents: AiBudgetAuditEventDto[];
  onCreatePricing: (input: {
    provider: string;
    model: string;
    currency: string;
    inputRatePer1m: string;
    outputRatePer1m: string;
    cachedInputRatePer1m: string;
    note: string;
  }) => Promise<void>;
  onSaveOrgBudget: (input: {
    period: "WEEKLY" | "MONTHLY";
    currency: string;
    amountUsd: string;
    warningThresholdPct: number;
  }) => Promise<void>;
}) {
  const orgBudget = budgets.find((b) => b.budget.projectId === null) ?? null;

  const [provider, setProvider] = useState("openai");
  const [model, setModel] = useState("gpt-4o-mini");
  const [pCurrency, setPCurrency] = useState("USD");
  const [inRate, setInRate] = useState("0.150000");
  const [outRate, setOutRate] = useState("0.600000");
  const [cachedRate, setCachedRate] = useState("");
  const [note, setNote] = useState("");
  const [pSaving, setPSaving] = useState(false);
  const [pMsg, setPMsg] = useState<string | null>(null);

  const [bPeriod, setBPeriod] = useState<"WEEKLY" | "MONTHLY">(
    orgBudget?.budget.period ?? "MONTHLY",
  );
  const [bCurrency, setBCurrency] = useState(orgBudget?.budget.currency ?? "USD");
  const [bAmount, setBAmount] = useState(orgBudget?.budget.amountUsd ?? "250.00");
  const [bWarn, setBWarn] = useState(String(orgBudget?.budget.warningThresholdPct ?? 80));
  const [bSaving, setBSaving] = useState(false);
  const [bMsg, setBMsg] = useState<string | null>(null);

  async function submitPricing(e: React.FormEvent) {
    e.preventDefault();
    setPSaving(true);
    setPMsg(null);
    try {
      await onCreatePricing({
        provider,
        model,
        currency: pCurrency,
        inputRatePer1m: inRate,
        outputRatePer1m: outRate,
        cachedInputRatePer1m: cachedRate,
        note,
      });
      setPMsg("Created new active pricing version (historical costs unchanged).");
      setNote("");
    } catch (err) {
      setPMsg(err instanceof Error ? err.message : "Failed to save pricing.");
    } finally {
      setPSaving(false);
    }
  }

  async function submitBudget(e: React.FormEvent) {
    e.preventDefault();
    setBSaving(true);
    setBMsg(null);
    try {
      await onSaveOrgBudget({
        period: bPeriod,
        currency: bCurrency,
        amountUsd: bAmount,
        warningThresholdPct: Number(bWarn),
      });
      setBMsg("Saved organization advisory budget.");
    } catch (err) {
      setBMsg(err instanceof Error ? err.message : "Failed to save budget.");
    } finally {
      setBSaving(false);
    }
  }

  return (
    <section className="panel-grid" aria-label="AI pricing versions and advisory budgets">
      <div className="app-card">
        <div className="app-card-header">
          <h2 className="inline-actions">
            <History size={17} /> Versioned Model Pricing
          </h2>
          <span className="field-hint">Historical records stay immutable</span>
        </div>

        <form onSubmit={submitPricing} className="analytics-form-grid">
          <label className="field-group">
            <span>Provider</span>
            <input
              className="field-input"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              required
            />
          </label>
          <label className="field-group">
            <span>Model</span>
            <input
              className="field-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              required
            />
          </label>
          <label className="field-group">
            <span>Currency</span>
            <input
              className="field-input"
              value={pCurrency}
              maxLength={3}
              onChange={(e) => setPCurrency(e.target.value.toUpperCase())}
              required
            />
          </label>
          <label className="field-group">
            <span>Input / 1M tok</span>
            <input
              className="field-input"
              type="number"
              step="0.000001"
              min="0"
              value={inRate}
              onChange={(e) => setInRate(e.target.value)}
              required
            />
          </label>
          <label className="field-group">
            <span>Output / 1M tok</span>
            <input
              className="field-input"
              type="number"
              step="0.000001"
              min="0"
              value={outRate}
              onChange={(e) => setOutRate(e.target.value)}
              required
            />
          </label>
          <label className="field-group">
            <span>Cached In / 1M (opt)</span>
            <input
              className="field-input"
              type="number"
              step="0.000001"
              min="0"
              value={cachedRate}
              onChange={(e) => setCachedRate(e.target.value)}
            />
          </label>
          <label className="field-group" style={{ gridColumn: "1 / -1" }}>
            <span>Change note (optional)</span>
            <input
              className="field-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Updated supplier rate card"
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }} className="inline-actions">
            <Button type="submit" size="compact" disabled={pSaving}>
              {pSaving ? "Saving..." : "Publish pricing version"}
            </Button>
            {pMsg && <span className="field-hint">{pMsg}</span>}
          </div>
        </form>

        {pricing.length > 0 && (
          <div className="data-table-wrap" style={{ marginTop: "1rem" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Version</th>
                  <th>Input / Output (1M)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pricing.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <code>
                        {rule.provider}/{rule.model}
                      </code>
                    </td>
                    <td>v{rule.version}</td>
                    <td>
                      {rule.currency} {rule.inputRatePer1m} / {rule.outputRatePer1m}
                    </td>
                    <td>
                      <span className={rule.isActive ? "badge badge-accent" : "badge"}>
                        {rule.isActive ? "Active" : "Historical"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="app-card">
        <div className="app-card-header">
          <h2 className="inline-actions">
            <CheckCircle2 size={17} /> Advisory AI Budgets
          </h2>
          <span className="field-hint">Monitoring &amp; warnings only</span>
        </div>

        <form onSubmit={submitBudget} className="analytics-form-grid">
          <label className="field-group">
            <span>Period</span>
            <select
              className="field-select"
              value={bPeriod}
              onChange={(e) => setBPeriod(e.target.value as "WEEKLY" | "MONTHLY")}
            >
              <option value="MONTHLY">Monthly (UTC)</option>
              <option value="WEEKLY">Weekly (UTC)</option>
            </select>
          </label>
          <label className="field-group">
            <span>Currency</span>
            <input
              className="field-input"
              value={bCurrency}
              maxLength={3}
              onChange={(e) => setBCurrency(e.target.value.toUpperCase())}
              required
            />
          </label>
          <label className="field-group">
            <span>Threshold Amount</span>
            <input
              className="field-input"
              type="number"
              step="0.01"
              min="0.01"
              value={bAmount}
              onChange={(e) => setBAmount(e.target.value)}
              required
            />
          </label>
          <label className="field-group">
            <span>Warn at (%)</span>
            <input
              className="field-input"
              type="number"
              min="1"
              max="100"
              value={bWarn}
              onChange={(e) => setBWarn(e.target.value)}
              required
            />
          </label>
          <div style={{ gridColumn: "1 / -1" }} className="inline-actions">
            <Button type="submit" size="compact" disabled={bSaving}>
              {bSaving ? "Saving..." : "Save org budget"}
            </Button>
            {bMsg && <span className="field-hint">{bMsg}</span>}
          </div>
        </form>

        <div className="analytics-stack" style={{ marginTop: "1rem" }}>
          {budgets.length === 0 ? (
            <p className="field-hint">No organization or project budgets configured yet.</p>
          ) : (
            budgets.map((b) => <BudgetStatusBanner key={b.budget.id} status={b} />)
          )}
        </div>

        {auditEvents.length > 0 && (
          <div style={{ marginTop: "1rem" }}>
            <h3 style={{ fontSize: ".88rem", marginBottom: ".5rem" }}>Budget Audit Log</h3>
            <ul className="analytics-compact-list">
              {auditEvents.slice(0, 8).map((ev) => (
                <li key={ev.id}>
                  <span>
                    <strong>{ev.action}</strong> · {ev.actor?.name || ev.actor?.email || "Admin"}
                  </span>
                  <span className="field-hint">{formatDateTime(ev.createdAt)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
