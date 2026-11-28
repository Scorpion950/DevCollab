import { BadRequestException } from "@nestjs/common";
import type {
  AnalyticsBucketGranularity,
  AnalyticsComparisonDto,
  AnalyticsDateFilterDto,
  AnalyticsRangePreset,
} from "@devcollab/shared";

export const MAX_ANALYTICS_RANGE_DAYS = 366;

export interface AnalyticsBucketWindow {
  bucketKey: string;
  label: string;
  startMs: number;
  endExclusiveMs: number;
}

export interface ParsedAnalyticsFilter extends AnalyticsDateFilterDto {
  periodStartDate: Date;
  periodEndExclusiveDate: Date;
  previousStartDate: Date;
  previousEndExclusiveDate: Date;
  spanDays: number;
  buckets: AnalyticsBucketWindow[];
}

function assertValidTimezone(timeZone: string): string {
  const cleaned = timeZone.trim() || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: cleaned }).format(new Date(0));
    return cleaned;
  } catch {
    throw new BadRequestException(`Invalid timezone "${timeZone}". Expected a valid IANA timezone (e.g. "UTC", "America/New_York").`);
  }
}

function getDatePartsInTimezone(
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const map = new Map<string, number>();
  for (const p of parts) {
    if (p.type !== "literal") {
      map.set(p.type, Number(p.value));
    }
  }
  return {
    year: map.get("year") ?? 1970,
    month: map.get("month") ?? 1,
    day: map.get("day") ?? 1,
    hour: map.get("hour") ?? 0,
    minute: map.get("minute") ?? 0,
    second: map.get("second") ?? 0,
  };
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseYmd(raw: string, fieldName: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) {
    throw new BadRequestException(`Invalid "${fieldName}" date "${raw}". Expected YYYY-MM-DD.`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new BadRequestException(`Invalid calendar date "${raw}" for "${fieldName}".`);
  }
  return { year, month, day };
}

function addDaysYmd(
  ymd: { year: number; month: number; day: number },
  deltaDays: number,
): { year: number; month: number; day: number } {
  const dt = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + deltaDays));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1,
    day: dt.getUTCDate(),
  };
}

function diffDaysYmd(
  a: { year: number; month: number; day: number },
  b: { year: number; month: number; day: number },
): number {
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86_400_000);
}

/**
 * Converts a local midnight wall clock date (YYYY-MM-DD 00:00:00) in `timeZone`
 * into its exact UTC Date instant without external dependencies.
 */
export function zonedMidnightToUtc(
  ymd: { year: number; month: number; day: number },
  timeZone: string,
): Date {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0, 0));
  }
  const targetUtc = Date.UTC(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0, 0);
  let guess = targetUtc;
  for (let i = 0; i < 3; i += 1) {
    const p = getDatePartsInTimezone(new Date(guess), timeZone);
    const observedUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
    const diff = targetUtc - observedUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

export function formatUtcDateKeyInTimezone(date: Date, timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return date.toISOString().slice(0, 10);
  }
  const p = getDatePartsInTimezone(date, timeZone);
  return formatYmd(p.year, p.month, p.day);
}

export function parseAnalyticsDateFilter(input: {
  preset?: string;
  from?: string;
  to?: string;
  timezone?: string;
  now?: Date;
}): ParsedAnalyticsFilter {
  const timezone = assertValidTimezone(input.timezone ?? "UTC");
  const now = input.now ?? new Date();

  let preset: AnalyticsRangePreset;
  const rawPreset = input.preset?.trim();
  if (!rawPreset) {
    preset = input.from || input.to ? "custom" : "30d";
  } else if (
    rawPreset === "7d" ||
    rawPreset === "30d" ||
    rawPreset === "90d" ||
    rawPreset === "custom"
  ) {
    preset = rawPreset;
  } else {
    throw new BadRequestException(
      `Invalid range preset "${rawPreset}". Expected 7d, 30d, 90d, or custom.`,
    );
  }

  let fromYmd: { year: number; month: number; day: number };
  let toYmd: { year: number; month: number; day: number };

  if (preset === "custom") {
    if (!input.from?.trim() || !input.to?.trim()) {
      throw new BadRequestException(
        'Custom date range requires both "from" and "to" query parameters (YYYY-MM-DD).',
      );
    }
    fromYmd = parseYmd(input.from, "from");
    toYmd = parseYmd(input.to, "to");
  } else {
    const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
    const todayParts = getDatePartsInTimezone(now, timezone);
    toYmd = { year: todayParts.year, month: todayParts.month, day: todayParts.day };
    fromYmd = addDaysYmd(toYmd, -(days - 1));
  }

  const diffDays = diffDaysYmd(fromYmd, toYmd);
  if (diffDays < 0) {
    throw new BadRequestException('"from" date must be on or before "to" date.');
  }
  const spanDays = diffDays + 1;
  if (spanDays > MAX_ANALYTICS_RANGE_DAYS) {
    throw new BadRequestException(
      `Date range of ${spanDays} days exceeds the maximum allowed window of ${MAX_ANALYTICS_RANGE_DAYS} days.`,
    );
  }

  const nextAfterToYmd = addDaysYmd(toYmd, 1);
  const prevFromYmd = addDaysYmd(fromYmd, -spanDays);

  const periodStartDate = zonedMidnightToUtc(fromYmd, timezone);
  const periodEndExclusiveDate = zonedMidnightToUtc(nextAfterToYmd, timezone);
  const previousStartDate = zonedMidnightToUtc(prevFromYmd, timezone);
  const previousEndExclusiveDate = periodStartDate;

  const granularity: AnalyticsBucketGranularity = spanDays > 60 ? "week" : "day";
  const buckets: AnalyticsBucketWindow[] = [];

  if (granularity === "day") {
    for (let i = 0; i < spanDays; i += 1) {
      const curYmd = addDaysYmd(fromYmd, i);
      const nextYmd = addDaysYmd(curYmd, 1);
      const key = formatYmd(curYmd.year, curYmd.month, curYmd.day);
      buckets.push({
        bucketKey: key,
        label: key.slice(5),
        startMs: zonedMidnightToUtc(curYmd, timezone).getTime(),
        endExclusiveMs: zonedMidnightToUtc(nextYmd, timezone).getTime(),
      });
    }
  } else {
    for (let i = 0; i < spanDays; i += 7) {
      const curYmd = addDaysYmd(fromYmd, i);
      const endStep = Math.min(spanDays, i + 7);
      const nextYmd = addDaysYmd(fromYmd, endStep);
      const key = formatYmd(curYmd.year, curYmd.month, curYmd.day);
      buckets.push({
        bucketKey: key,
        label: `Wk ${key.slice(5)}`,
        startMs: zonedMidnightToUtc(curYmd, timezone).getTime(),
        endExclusiveMs: zonedMidnightToUtc(nextYmd, timezone).getTime(),
      });
    }
  }

  return {
    preset,
    from: formatYmd(fromYmd.year, fromYmd.month, fromYmd.day),
    to: formatYmd(toYmd.year, toYmd.month, toYmd.day),
    timezone,
    granularity,
    periodStartUtc: periodStartDate.toISOString(),
    periodEndUtc: new Date(periodEndExclusiveDate.getTime() - 1).toISOString(),
    previousStartUtc: previousStartDate.toISOString(),
    previousEndUtc: new Date(previousEndExclusiveDate.getTime() - 1).toISOString(),
    periodStartDate,
    periodEndExclusiveDate,
    previousStartDate,
    previousEndExclusiveDate,
    spanDays,
    buckets,
  };
}

export function findBucketIndex(buckets: AnalyticsBucketWindow[], date: Date): number {
  const ts = date.getTime();
  let lo = 0;
  let hi = buckets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const b = buckets[mid]!;
    if (ts < b.startMs) {
      hi = mid - 1;
    } else if (ts >= b.endExclusiveMs) {
      lo = mid + 1;
    } else {
      return mid;
    }
  }
  return -1;
}

export function computeComparison(
  current: number | null,
  previous: number | null,
): AnalyticsComparisonDto {
  if (current === null || previous === null) {
    return { current, previous, deltaPct: null, state: "UNAVAILABLE" };
  }
  if (previous === 0) {
    return { current, previous, deltaPct: null, state: "ZERO_BASELINE" };
  }
  const deltaPct = Math.round(((current - previous) / previous) * 1000) / 10;
  return { current, previous, deltaPct, state: "VALID" };
}

export function getBudgetWindowUtc(
  period: "WEEKLY" | "MONTHLY",
  now: Date = new Date(),
): { windowStartDate: Date; windowEndExclusiveDate: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();

  if (period === "WEEKLY") {
    const day = now.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const start = new Date(Date.UTC(year, month, date + diffToMonday, 0, 0, 0, 0));
    const endExclusive = new Date(start.getTime() + 7 * 86_400_000);
    return { windowStartDate: start, windowEndExclusiveDate: endExclusive };
  }

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  return { windowStartDate: start, windowEndExclusiveDate: endExclusive };
}
