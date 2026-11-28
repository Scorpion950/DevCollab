import { Injectable } from "@nestjs/common";

const MAX_EXPORT_ROWS = 5_000;
const FORMULA_PREFIX_REGEX = /^[\s]*[=+\-@\t\r]/;

export function neutralizeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = String(value);
  if (!str) return "";

  if (
    str.startsWith("=") ||
    str.startsWith("+") ||
    str.startsWith("-") ||
    str.startsWith("@") ||
    str.startsWith("\t") ||
    str.startsWith("\r") ||
    FORMULA_PREFIX_REGEX.test(str)
  ) {
    str = `'${str}`;
  }

  if (/[",\r\n]/.test(str) || str.startsWith("'")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

@Injectable()
export class AnalyticsExportService {
  buildCsv(headers: string[], rows: unknown[][]): string {
    const headerLine = headers.map((h) => neutralizeCsvCell(h)).join(",");
    const clipped = rows.slice(0, MAX_EXPORT_ROWS);
    const bodyLines = clipped.map((row) =>
      row.map((cell) => neutralizeCsvCell(cell)).join(","),
    );
    return [headerLine, ...bodyLines].join("\r\n") + "\r\n";
  }
}
