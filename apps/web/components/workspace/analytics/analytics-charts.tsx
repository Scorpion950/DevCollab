"use client";

import type {
  AiExecutionTrendPointDto,
  AiUsageTrendPointDto,
  DeliveryTrendPointDto,
  TaskStatusDistributionItemDto,
} from "@devcollab/shared";

const STATUS_COLORS: Record<string, string> = {
  BACKLOG: "#64748b",
  TODO: "#3b82f6",
  IN_PROGRESS: "#f59e0b",
  IN_REVIEW: "#0ea5e9",
  DONE: "#10b981",
};

export function StatusDistributionBar({
  items,
  total,
}: {
  items: TaskStatusDistributionItemDto[];
  total: number;
}) {
  if (total === 0) {
    return (
      <p className="field-hint">
        No non-archived tasks exist in this scope yet.
      </p>
    );
  }

  return (
    <div className="analytics-dist-wrap">
      <div
        className="analytics-stacked-bar"
        role="img"
        aria-label={`Task status breakdown across ${total} non-archived tasks`}
      >
        {items.map((item) => {
          if (item.count === 0) return null;
          const pct = Math.max(2, (item.count / total) * 100);
          return (
            <div
              key={item.status}
              style={{
                width: `${pct}%`,
                backgroundColor: STATUS_COLORS[item.status] ?? "var(--accent)",
              }}
              title={`${item.label}: ${item.count} (${Math.round((item.count / total) * 100)}%)`}
            />
          );
        })}
      </div>

      <div className="analytics-legend-grid">
        {items.map((item) => {
          const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
          return (
            <div key={item.status} className="analytics-legend-item">
              <span
                className="analytics-swatch"
                style={{ backgroundColor: STATUS_COLORS[item.status] ?? "var(--accent)" }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
              <strong style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>
                {item.count}
              </strong>
              <span className="field-hint">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeliveryTrendChart({ points }: { points: DeliveryTrendPointDto[] }) {
  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(p.createdCount, p.completedCount)),
  );
  const totalCreated = points.reduce((s, p) => s + p.createdCount, 0);
  const totalCompleted = points.reduce((s, p) => s + p.completedCount, 0);

  if (points.length === 0) {
    return <p className="field-hint">No trend buckets available for this filter.</p>;
  }

  const step = Math.max(1, Math.ceil(points.length / 8));
  const width = 640;
  const height = 180;
  const padLeft = 30;
  const padBottom = 26;
  const plotW = width - padLeft - 12;
  const plotH = height - padBottom - 14;
  const groupW = plotW / points.length;
  const barW = Math.max(2, Math.min(12, groupW * 0.34));

  return (
    <div className="analytics-chart-box">
      <div className="analytics-chart-header">
        <div className="analytics-legend-inline">
          <span>
            <i className="analytics-swatch" style={{ backgroundColor: "#3b82f6" }} /> Created ({totalCreated})
          </span>
          <span>
            <i className="analytics-swatch" style={{ backgroundColor: "#10b981" }} /> Completed ({totalCompleted})
          </span>
        </div>
        <span className="field-hint">Peak: {maxVal}/bucket</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="analytics-svg"
        role="img"
        aria-label={`Task creation and completion trend chart: ${totalCreated} created and ${totalCompleted} completed across ${points.length} time buckets.`}
      >
        {[0, 0.5, 1].map((tick) => {
          const y = 14 + plotH * (1 - tick);
          const val = Math.round(maxVal * tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - 10}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                opacity={0.65}
              >
                {val}
              </text>
            </g>
          );
        })}

        {points.map((pt, idx) => {
          const cx = padLeft + idx * groupW + groupW / 2;
          const hCreated = (pt.createdCount / maxVal) * plotH;
          const hDone = (pt.completedCount / maxVal) * plotH;
          return (
            <g key={pt.bucketKey}>
              <rect
                x={cx - barW - 1}
                y={14 + plotH - hCreated}
                width={barW}
                height={Math.max(pt.createdCount > 0 ? 2 : 0, hCreated)}
                rx={1.5}
                fill="#3b82f6"
              >
                <title>{`${pt.bucketKey}: ${pt.createdCount} created`}</title>
              </rect>
              <rect
                x={cx + 1}
                y={14 + plotH - hDone}
                width={barW}
                height={Math.max(pt.completedCount > 0 ? 2 : 0, hDone)}
                rx={1.5}
                fill="#10b981"
              >
                <title>{`${pt.bucketKey}: ${pt.completedCount} completed`}</title>
              </rect>
              {idx % step === 0 && (
                <text
                  x={cx}
                  y={height - 7}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  opacity={0.68}
                >
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function AiActivityTrendChart({
  executionTrends,
  usageTrends,
}: {
  executionTrends?: AiExecutionTrendPointDto[];
  usageTrends: AiUsageTrendPointDto[];
}) {
  const points = usageTrends.map((u, idx) => ({
    bucketKey: u.bucketKey,
    label: u.label,
    requests: u.requestCount,
    tokens: u.reportedTokens,
    spend: u.estimatedSpend,
    runs: executionTrends?.[idx]?.totalRuns ?? 0,
    failedRuns: executionTrends?.[idx]?.failedRuns ?? 0,
  }));

  const maxReq = Math.max(1, ...points.map((p) => p.requests));
  const totalRequests = points.reduce((s, p) => s + p.requests, 0);

  if (points.length === 0 || totalRequests === 0) {
    return (
      <p className="field-hint">
        No AI requests recorded during this time range.
      </p>
    );
  }

  const width = 640;
  const height = 160;
  const padLeft = 30;
  const padBottom = 26;
  const plotW = width - padLeft - 12;
  const plotH = height - padBottom - 12;
  const groupW = plotW / points.length;
  const barW = Math.max(3, Math.min(18, groupW * 0.6));
  const step = Math.max(1, Math.ceil(points.length / 8));

  return (
    <div className="analytics-chart-box">
      <div className="analytics-chart-header">
        <div className="analytics-legend-inline">
          <span>
            <i className="analytics-swatch" style={{ backgroundColor: "var(--accent)" }} /> AI requests ({totalRequests})
          </span>
        </div>
        <span className="field-hint">Hover bars for token &amp; spend snapshot</span>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="analytics-svg"
        role="img"
        aria-label={`AI request activity across ${points.length} buckets totaling ${totalRequests} requests.`}
      >
        {[0, 0.5, 1].map((tick) => {
          const y = 12 + plotH * (1 - tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - 10}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.12}
                strokeDasharray="3 3"
              />
              <text
                x={padLeft - 6}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                opacity={0.65}
              >
                {Math.round(maxReq * tick)}
              </text>
            </g>
          );
        })}

        {points.map((pt, idx) => {
          const cx = padLeft + idx * groupW + groupW / 2;
          const h = (pt.requests / maxReq) * plotH;
          const tokStr = pt.tokens !== null ? `${pt.tokens.toLocaleString()} tok` : "tokens unavailable";
          const costStr = pt.spend !== null ? `$${pt.spend}` : "cost unavailable";
          return (
            <g key={pt.bucketKey}>
              <rect
                x={cx - barW / 2}
                y={12 + plotH - h}
                width={barW}
                height={Math.max(pt.requests > 0 ? 2 : 0, h)}
                rx={2}
                fill="var(--accent)"
                opacity={0.9}
              >
                <title>{`${pt.bucketKey}: ${pt.requests} req · ${tokStr} · ${costStr}`}</title>
              </rect>
              {idx % step === 0 && (
                <text
                  x={cx}
                  y={height - 7}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  opacity={0.68}
                >
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
