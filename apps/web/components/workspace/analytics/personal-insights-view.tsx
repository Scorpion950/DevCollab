"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, CircleAlert, Sparkles } from "lucide-react";
import type { PersonalInsightsDto } from "@devcollab/shared";
import { AnalyticsFilterBar, type AnalyticsFilterSelection } from "./analytics-filter-bar";
import { AiUsageCostSection } from "./analytics-panels";
import { DueDateChip, formatDateTime, TaskStatusBadge } from "../task-badges";

export function PersonalInsightsView({
  initialData,
}: {
  initialData?: PersonalInsightsDto | null;
}) {
  const [data, setData] = useState<PersonalInsightsDto | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<AnalyticsFilterSelection>({
    preset: initialData?.filter.preset ?? "30d",
    from: initialData?.filter.from ?? "",
    to: initialData?.filter.to ?? "",
    timezone: initialData?.filter.timezone ?? "UTC",
  });

  async function loadPersonal(nextSel: AnalyticsFilterSelection, page = 1) {
    setSelection(nextSel);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("preset", nextSel.preset);
      if (nextSel.preset === "custom" && nextSel.from && nextSel.to) {
        params.set("from", nextSel.from);
        params.set("to", nextSel.to);
      }
      if (nextSel.timezone) params.set("timezone", nextSel.timezone);
      if (nextSel.refresh) params.set("refresh", "1");
      params.set("page", String(page));
      params.set("pageSize", "15");
      const res = await fetch(`/api/workspace/analytics/personal?${params.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to load personal insights.");
      }
      setData(json as PersonalInsightsDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load personal insights.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!initialData) {
      const detectedTz =
        typeof Intl !== "undefined"
          ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
          : "UTC";
      void loadPersonal({ preset: "30d", from: "", to: "", timezone: detectedTz }, 1);
    }
  }, [initialData]);

  if (loading && !data) {
    return (
      <section className="app-card">
        <p className="field-hint">Loading your personal insights…</p>
      </section>
    );
  }

  if (error && !data) {
    return (
      <p className="banner banner-error" role="alert">
        <span className="inline-actions">
          <CircleAlert size={16} />
          {error}
        </span>
      </p>
    );
  }

  if (!data) return null;

  const exportParams = new URLSearchParams({
    scope: "personal",
    preset: selection.preset,
    timezone: selection.timezone,
  });
  if (selection.preset === "custom" && selection.from && selection.to) {
    exportParams.set("from", selection.from);
    exportParams.set("to", selection.to);
  }

  return (
    <div className="analytics-page">
      <AnalyticsFilterBar
        filter={data.filter}
        loading={loading}
        generatedAtUtc={data.generatedAtUtc}
        onApply={(next) => void loadPersonal(next, 1)}
        exportLinks={[
          {
            label: "Export My AI Usage CSV",
            href: `/api/workspace/analytics/export?${exportParams.toString()}`,
          },
        ]}
      />

      {error && (
        <p className="banner banner-error" role="alert">
          {error}
        </p>
      )}

      <section className="app-card" aria-labelledby="personal-summary-heading">
        <div className="app-card-header">
          <h2 id="personal-summary-heading" className="inline-actions">
            <Sparkles size={17} /> Your Work &amp; Delivery Summary ({data.organizationName})
          </h2>
          <span className="badge">Strictly scoped to your account</span>
        </div>

        <dl className="stat-grid">
          <div className="stat-card">
            <dt>Active Assigned Tasks</dt>
            <dd>{data.assignedActiveCount}</dd>
          </div>
          <div className="stat-card">
            <dt>Completed in Period</dt>
            <dd>{data.completedInPeriodCount}</dd>
          </div>
          <div className="stat-card">
            <dt>Overdue Assigned</dt>
            <dd style={data.overdueAssignedCount > 0 ? { color: "var(--warm-ink)" } : undefined}>
              {data.overdueAssignedCount}
            </dd>
          </div>
          <div className="stat-card">
            <dt>Due Within 72h</dt>
            <dd>{data.dueSoonAssignedCount}</dd>
          </div>
        </dl>
      </section>

      <div className="panel-grid">
        <section className="app-card" aria-labelledby="personal-active-tasks-heading">
          <div className="app-card-header">
            <h3 id="personal-active-tasks-heading">Upcoming &amp; Active Tasks</h3>
          </div>
          {data.recentTasks.length === 0 ? (
            <p className="field-hint">No open tasks currently assigned to you.</p>
          ) : (
            <ul className="analytics-compact-list">
              {data.recentTasks.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/app/projects/${encodeURIComponent(t.projectId)}/tasks/${encodeURIComponent(t.id)}`}
                    className="text-action-link"
                  >
                    <span className="project-key">{t.identifier}</span> {t.title}
                  </Link>
                  <span className="inline-actions">
                    <TaskStatusBadge status={t.status} />
                    {t.dueDate && <DueDateChip dueDate={t.dueDate} status={t.status} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="app-card" aria-labelledby="personal-activity-heading">
          <div className="app-card-header">
            <h3 id="personal-activity-heading" className="inline-actions">
              <Activity size={16} /> Recent Task Activity
            </h3>
          </div>
          {data.recentActivities.length === 0 ? (
            <p className="field-hint">No task activity recorded for your work in this period.</p>
          ) : (
            <ul className="analytics-compact-list">
              {data.recentActivities.map((act) => (
                <li key={act.id}>
                  <span>
                    <span className="project-key">{act.taskIdentifier}</span> {act.summary}
                  </span>
                  <span className="field-hint" style={{ fontSize: ".75rem" }}>
                    {formatDateTime(act.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <AiUsageCostSection
        usage={data.aiUsage}
        canViewCostDetails={true}
        showProjectBreakdown={true}
        onPageChange={(page) => void loadPersonal(selection, page)}
      />
    </div>
  );
}
