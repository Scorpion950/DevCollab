"use client";

import { useState } from "react";
import Link from "next/link";
import { BarChart3, FolderKanban, ShieldAlert } from "lucide-react";
import type {
  AiBudgetAuditEventDto,
  AiBudgetStatusDto,
  AiModelPricingDto,
  OrganizationAnalyticsDto,
} from "@devcollab/shared";
import { AnalyticsFilterBar, type AnalyticsFilterSelection } from "./analytics-filter-bar";
import {
  AiExecutionSection,
  AiUsageCostSection,
  GitHubMetricsSection,
  PricingAndBudgetManager,
  TaskDeliverySection,
  formatMoneyAmount,
} from "./analytics-panels";

function toQs(
  filter: AnalyticsFilterSelection,
  page = 1,
  pageSize = 15,
): string {
  const params = new URLSearchParams();
  params.set("preset", filter.preset);
  if (filter.preset === "custom" && filter.from && filter.to) {
    params.set("from", filter.from);
    params.set("to", filter.to);
  }
  if (filter.timezone) params.set("timezone", filter.timezone);
  if (filter.refresh) params.set("refresh", "1");
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return params.toString();
}

export function OrgAnalyticsView({
  initialData,
  initialPricing,
  initialBudgets,
  initialAuditEvents,
}: {
  initialData: OrganizationAnalyticsDto;
  initialPricing: AiModelPricingDto[];
  initialBudgets: AiBudgetStatusDto[];
  initialAuditEvents: AiBudgetAuditEventDto[];
}) {
  const [data, setData] = useState<OrganizationAnalyticsDto>(initialData);
  const [pricing, setPricing] = useState<AiModelPricingDto[]>(initialPricing);
  const [budgets, setBudgets] = useState<AiBudgetStatusDto[]>(initialBudgets);
  const [auditEvents, setAuditEvents] = useState<AiBudgetAuditEventDto[]>(initialAuditEvents);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selection, setSelection] = useState<AnalyticsFilterSelection>({
    preset: initialData.filter.preset,
    from: initialData.filter.from,
    to: initialData.filter.to,
    timezone: initialData.filter.timezone,
  });

  async function loadAnalytics(nextSel: AnalyticsFilterSelection, page = 1) {
    setSelection(nextSel);
    setLoading(true);
    setError(null);
    try {
      const qs = toQs(nextSel, page, data.aiUsage.pageSize);
      const res = await fetch(`/api/workspace/analytics/organization?${qs}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to load organization analytics.");
      }
      const nextData = json as OrganizationAnalyticsDto;
      setData(nextData);
      setBudgets(nextData.budgets);
      setAuditEvents(nextData.budgetAuditEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshPricingAndBudgets() {
    const [pRes, bRes] = await Promise.all([
      fetch("/api/workspace/analytics/pricing", { cache: "no-store" }),
      fetch("/api/workspace/analytics/budgets", { cache: "no-store" }),
    ]);
    if (pRes.ok) {
      setPricing((await pRes.json()) as AiModelPricingDto[]);
    }
    if (bRes.ok) {
      const bj = (await bRes.json()) as {
        budgets: AiBudgetStatusDto[];
        auditEvents: AiBudgetAuditEventDto[];
      };
      setBudgets(bj.budgets);
      setAuditEvents(bj.auditEvents);
    }
  }

  async function handleCreatePricing(input: {
    provider: string;
    model: string;
    currency: string;
    inputRatePer1m: string;
    outputRatePer1m: string;
    cachedInputRatePer1m: string;
    note: string;
  }) {
    const res = await fetch("/api/workspace/analytics/pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        cachedInputRatePer1m: input.cachedInputRatePer1m || undefined,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.message || "Failed to publish pricing version.");
    }
    await refreshPricingAndBudgets();
    await loadAnalytics(selection, data.aiUsage.page);
  }

  async function handleSaveOrgBudget(input: {
    period: "WEEKLY" | "MONTHLY";
    currency: string;
    amountUsd: string;
    warningThresholdPct: number;
  }) {
    const res = await fetch("/api/workspace/analytics/budgets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.message || "Failed to save organization budget.");
    }
    await refreshPricingAndBudgets();
    await loadAnalytics(selection, data.aiUsage.page);
  }

  const exportFilterQs = toQs(selection, 1, 50);
  const budgetWarnings = budgets.filter(
    (b) => b.state === "APPROACHING_BUDGET" || b.state === "BUDGET_EXCEEDED",
  );

  return (
    <div className="analytics-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Organization Analytics</p>
          <h1 className="inline-actions">
            <BarChart3 size={22} /> {data.organizationName}
          </h1>
          <p className="field-hint">
            Verified delivery velocity, GitHub PR activity, AI execution telemetry, and versioned spend visibility across your organization.
          </p>
        </div>
      </div>

      {budgetWarnings.length > 0 && (
        <div className="banner banner-warn" role="status">
          <ShieldAlert size={16} />
          <div>
            <strong>Advisory Budget Alert:</strong>{" "}
            {budgetWarnings.map((w) => w.warnings[0]).join(" · ")}
          </div>
        </div>
      )}

      <AnalyticsFilterBar
        filter={data.filter}
        loading={loading}
        generatedAtUtc={data.generatedAtUtc}
        cachedHit={data.cachedHit}
        onApply={(next) => void loadAnalytics(next, 1)}
        exportLinks={[
          {
            label: "Export AI Usage CSV",
            href: `/api/workspace/analytics/export?scope=organization&dataset=ai-usage&${exportFilterQs}`,
          },
          {
            label: "Export Delivery CSV",
            href: `/api/workspace/analytics/export?scope=organization&dataset=delivery&${exportFilterQs}`,
          },
        ]}
      />

      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}

      <TaskDeliverySection delivery={data.delivery} />

      <section className="app-card" aria-labelledby="org-projects-breakdown-heading">
        <div className="app-card-header">
          <h2 id="org-projects-breakdown-heading" className="inline-actions">
            <FolderKanban size={17} /> Project Breakdown ({data.projectBreakdown.length})
          </h2>
          <span className="field-hint">Click any project to inspect cycle time and queue health</span>
        </div>

        {data.projectBreakdown.length === 0 ? (
          <p className="field-hint">No projects created in this organization yet.</p>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Active Tasks</th>
                  <th>Completed (Period)</th>
                  <th>Overdue</th>
                  <th>Open PRs</th>
                  <th>AI Calls</th>
                  <th>Est. AI Spend</th>
                </tr>
              </thead>
              <tbody>
                {data.projectBreakdown.map((proj) => (
                  <tr key={proj.projectId}>
                    <td>
                      <Link
                        href={`/app/projects/${encodeURIComponent(proj.projectId)}/analytics`}
                        className="text-action-link"
                      >
                        <span className="project-key">{proj.projectKey}</span>{" "}
                        <strong>{proj.projectName}</strong>
                      </Link>
                    </td>
                    <td>
                      <span className="badge">{proj.status.toLowerCase()}</span>
                    </td>
                    <td>{proj.activeTasks}</td>
                    <td>{proj.completedInPeriod}</td>
                    <td style={proj.overdueTasks > 0 ? { color: "var(--warm-ink)" } : undefined}>
                      {proj.overdueTasks}
                    </td>
                    <td>{proj.openPullRequests}</td>
                    <td>{proj.aiRequestCount}</td>
                    <td>
                      {proj.costStatus === "NO_USAGE"
                        ? "No AI usage"
                        : proj.costStatus === "PRICING_UNAVAILABLE"
                          ? "Cost estimate unavailable."
                          : formatMoneyAmount(proj.estimatedSpendUsd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <GitHubMetricsSection github={data.github} />

      <AiExecutionSection
        execution={data.aiExecution}
        usageTrends={data.aiUsage.trends}
      />

      <AiUsageCostSection
        usage={data.aiUsage}
        canViewCostDetails={true}
        showProjectBreakdown={true}
        onPageChange={(page) => void loadAnalytics(selection, page)}
      />

      <PricingAndBudgetManager
        pricing={pricing}
        budgets={budgets}
        auditEvents={auditEvents}
        onCreatePricing={handleCreatePricing}
        onSaveOrgBudget={handleSaveOrgBudget}
      />
    </div>
  );
}
