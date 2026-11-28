"use client";

import { useState } from "react";
import type { ProjectAnalyticsDto } from "@devcollab/shared";
import { AnalyticsFilterBar, type AnalyticsFilterSelection } from "./analytics-filter-bar";
import {
  AiExecutionSection,
  AiUsageCostSection,
  GitHubMetricsSection,
  ProjectBudgetCard,
  TaskDeliverySection,
  TaskHealthSection,
  TaskLifecycleSection,
} from "./analytics-panels";

function toQs(filter: AnalyticsFilterSelection, page = 1, pageSize = 15): string {
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

export function ProjectAnalyticsView({
  initialData,
}: {
  initialData: ProjectAnalyticsDto;
}) {
  const [data, setData] = useState<ProjectAnalyticsDto>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<AnalyticsFilterSelection>({
    preset: initialData.filter.preset,
    from: initialData.filter.from,
    to: initialData.filter.to,
    timezone: initialData.filter.timezone,
  });

  async function loadProjectAnalytics(nextSel: AnalyticsFilterSelection, page = 1) {
    setSelection(nextSel);
    setLoading(true);
    setError(null);
    try {
      const qs = toQs(nextSel, page, data.aiUsage.pageSize);
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(data.project.id)}/analytics?${qs}`,
        { cache: "no-store" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to load project analytics.");
      }
      setData(json as ProjectAnalyticsDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh project analytics.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveProjectBudget(input: {
    period: "WEEKLY" | "MONTHLY";
    currency: string;
    amountUsd: string;
    warningThresholdPct: number;
  }) {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(data.project.id)}/analytics/budget`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.message || "Failed to update project budget.");
    }
    await loadProjectAnalytics(selection, data.aiUsage.page);
  }

  const exportFilterQs = toQs(selection, 1, 50);

  return (
    <div className="analytics-page">
      <AnalyticsFilterBar
        filter={data.filter}
        loading={loading}
        generatedAtUtc={data.generatedAtUtc}
        cachedHit={data.cachedHit}
        onApply={(next) => void loadProjectAnalytics(next, 1)}
        exportLinks={[
          {
            label: "Export Project Delivery CSV",
            href: `/api/workspace/analytics/export?scope=project&dataset=delivery&projectId=${encodeURIComponent(data.project.id)}&${exportFilterQs}`,
          },
          {
            label: "Export Project AI CSV",
            href: `/api/workspace/analytics/export?scope=project&dataset=ai-usage&projectId=${encodeURIComponent(data.project.id)}&${exportFilterQs}`,
          },
        ]}
      />

      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}

      <TaskDeliverySection delivery={data.delivery} />

      <TaskLifecycleSection lifecycle={data.lifecycle} />

      <TaskHealthSection insights={data.healthInsights} projectId={data.project.id} />

      <GitHubMetricsSection github={data.github} />

      <AiExecutionSection
        execution={data.aiExecution}
        usageTrends={data.aiUsage.trends}
      />

      <AiUsageCostSection
        usage={data.aiUsage}
        canViewCostDetails={data.canViewUsageCosts}
        showProjectBreakdown={false}
        onPageChange={(page) => void loadProjectAnalytics(selection, page)}
      />

      <ProjectBudgetCard
        budgetStatus={data.budgetStatus}
        canManageBudget={data.canManageBudget}
        onSaveBudget={handleSaveProjectBudget}
      />
    </div>
  );
}
