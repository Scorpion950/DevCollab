"use client";

import { useEffect, useState } from "react";
import { Calendar, Download, RefreshCw } from "lucide-react";
import type { AnalyticsDateFilterDto, AnalyticsRangePreset } from "@devcollab/shared";
import { Button } from "@/components/ui/button";

export interface AnalyticsFilterSelection {
  preset: AnalyticsRangePreset;
  from: string;
  to: string;
  timezone: string;
  refresh?: boolean;
}

const COMMON_TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Asia/Tokyo",
];

function todayYmdInTz(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const map = new Map(parts.map((p) => [p.type, p.value]));
    return `${map.get("year") ?? "2026"}-${map.get("month") ?? "01"}-${map.get("day") ?? "01"}`;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function AnalyticsFilterBar({
  filter,
  loading,
  generatedAtUtc,
  cachedHit,
  onApply,
  exportLinks,
}: {
  filter: AnalyticsDateFilterDto;
  loading: boolean;
  generatedAtUtc: string;
  cachedHit?: boolean;
  onApply: (next: AnalyticsFilterSelection) => void;
  exportLinks?: Array<{ label: string; href: string }>;
}) {
  const [preset, setPreset] = useState<AnalyticsRangePreset>(filter.preset);
  const [from, setFrom] = useState(filter.from);
  const [to, setTo] = useState(filter.to);
  const [timezone, setTimezone] = useState(filter.timezone);
  const [timezoneChoices, setTimezoneChoices] = useState<string[]>(COMMON_TIMEZONES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setPreset(filter.preset);
    setFrom(filter.from);
    setTo(filter.to);
    setTimezone(filter.timezone);
  }, [filter.from, filter.preset, filter.timezone, filter.to]);

  useEffect(() => {
    try {
      const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (detected && !COMMON_TIMEZONES.includes(detected)) {
        setTimezoneChoices([detected, ...COMMON_TIMEZONES]);
      }
    } catch {
      // Ignore environments without Intl timezone lookup
    }
  }, []);

  function applyPreset(nextPreset: "7d" | "30d" | "90d") {
    setValidationError(null);
    setPreset(nextPreset);
    onApply({ preset: nextPreset, from: "", to: "", timezone });
  }

  function applyCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!from || !to) {
      setValidationError("Select both start and end dates.");
      return;
    }
    if (from > to) {
      setValidationError("Start date must be on or before end date.");
      return;
    }
    const diffDays =
      Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
    if (diffDays > 366) {
      setValidationError("Date range cannot exceed 366 days.");
      return;
    }
    setValidationError(null);
    setPreset("custom");
    onApply({ preset: "custom", from, to, timezone });
  }

  function handleTimezoneChange(nextTz: string) {
    setTimezone(nextTz);
    setValidationError(null);
    onApply({
      preset,
      from: preset === "custom" ? from || todayYmdInTz(nextTz) : "",
      to: preset === "custom" ? to || todayYmdInTz(nextTz) : "",
      timezone: nextTz,
    });
  }

  return (
    <section className="app-card analytics-filter-card" aria-label="Analytics filters and exports">
      <div className="analytics-filter-row">
        <div className="analytics-preset-group" role="group" aria-label="Date range presets">
          {(["7d", "30d", "90d"] as const).map((key) => (
            <Button
              key={key}
              type="button"
              size="compact"
              variant={preset === key ? "primary" : "secondary"}
              disabled={loading}
              onClick={() => applyPreset(key)}
            >
              {key === "7d" ? "Last 7 days" : key === "30d" ? "Last 30 days" : "Last 90 days"}
            </Button>
          ))}
        </div>

        <form className="analytics-custom-form" onSubmit={applyCustom}>
          <label className="analytics-inline-label">
            <Calendar size={14} aria-hidden="true" />
            <span className="sr-only">From date</span>
            <input
              type="date"
              className="field-input analytics-date-input"
              aria-label="From date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("custom");
              }}
            />
          </label>
          <span className="field-hint">to</span>
          <label className="analytics-inline-label">
            <span className="sr-only">To date</span>
            <input
              type="date"
              className="field-input analytics-date-input"
              aria-label="To date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("custom");
              }}
            />
          </label>
          <select
            aria-label="Timezone"
            className="field-select analytics-tz-select"
            value={timezone}
            disabled={loading}
            onChange={(e) => handleTimezoneChange(e.target.value)}
          >
            {timezoneChoices.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <Button type="submit" size="compact" variant="secondary" disabled={loading}>
            Apply
          </Button>
        </form>

        <div className="inline-actions" style={{ marginLeft: "auto", flexWrap: "wrap" }}>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            disabled={loading}
            onClick={() =>
              onApply({
                preset,
                from: preset === "custom" ? from : "",
                to: preset === "custom" ? to : "",
                timezone,
                refresh: true,
              })
            }
          >
            <RefreshCw size={14} className={loading ? "spin-icon" : ""} /> Refresh
          </Button>
          {exportLinks?.map((item) => (
            <a
              key={item.href}
              href={item.href}
              download
              className="btn btn-secondary btn-compact"
            >
              <Download size={14} aria-hidden="true" /> {item.label}
            </a>
          ))}
        </div>
      </div>

      <div className="analytics-filter-meta">
        <span>
          Window: <strong>{filter.from}</strong> → <strong>{filter.to}</strong> ({filter.timezone}) ·{" "}
          {filter.granularity === "week" ? "Weekly buckets" : "Daily buckets"}
        </span>
        <span>
          Updated {new Date(generatedAtUtc).toLocaleTimeString()}
          {cachedHit ? " · cached (<20s)" : ""}
        </span>
      </div>

      {validationError && (
        <p className="banner banner-error" role="alert">
          {validationError}
        </p>
      )}
    </section>
  );
}
