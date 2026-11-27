export interface ParsedDiffLine {
  kind: "hunk" | "context" | "add" | "del" | "note";
  content: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface SplitDiffRow {
  kind: "hunk" | "note" | "pair";
  hunkHeader?: string;
  left?: ParsedDiffLine | null;
  right?: ParsedDiffLine | null;
}

const HUNK_RE = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseUnifiedPatch(patch: string | null): ParsedDiffLine[] {
  if (!patch) return [];
  const rawLines = patch.split(/\r?\n/);
  const lines: ParsedDiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const raw of rawLines) {
    const hunkMatch = HUNK_RE.exec(raw);
    if (hunkMatch) {
      oldNum = Number.parseInt(hunkMatch[1] ?? "1", 10);
      newNum = Number.parseInt(hunkMatch[2] ?? "1", 10);
      lines.push({ kind: "hunk", content: raw, oldLine: null, newLine: null });
      continue;
    }

    if (raw.startsWith("+")) {
      lines.push({
        kind: "add",
        content: raw.slice(1),
        oldLine: null,
        newLine: newNum,
      });
      newNum += 1;
      continue;
    }

    if (raw.startsWith("-")) {
      lines.push({
        kind: "del",
        content: raw.slice(1),
        oldLine: oldNum,
        newLine: null,
      });
      oldNum += 1;
      continue;
    }

    if (raw.startsWith("\\")) {
      lines.push({ kind: "note", content: raw, oldLine: null, newLine: null });
      continue;
    }

    lines.push({
      kind: "context",
      content: raw.startsWith(" ") ? raw.slice(1) : raw,
      oldLine: oldNum || null,
      newLine: newNum || null,
    });
    if (oldNum > 0) oldNum += 1;
    if (newNum > 0) newNum += 1;
  }

  return lines;
}

export function buildSplitRows(lines: ParsedDiffLine[]): SplitDiffRow[] {
  const rows: SplitDiffRow[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line) break;

    if (line.kind === "hunk") {
      rows.push({ kind: "hunk", hunkHeader: line.content });
      i += 1;
      continue;
    }
    if (line.kind === "note") {
      rows.push({ kind: "note", hunkHeader: line.content });
      i += 1;
      continue;
    }
    if (line.kind === "context") {
      rows.push({ kind: "pair", left: line, right: line });
      i += 1;
      continue;
    }

    const dels: ParsedDiffLine[] = [];
    for (let next = lines[i]; next && next.kind === "del"; i += 1, next = lines[i]) {
      dels.push(next);
    }
    const adds: ParsedDiffLine[] = [];
    for (let next = lines[i]; next && next.kind === "add"; i += 1, next = lines[i]) {
      adds.push(next);
    }
    const len = Math.max(dels.length, adds.length);
    for (let k = 0; k < len; k++) {
      rows.push({
        kind: "pair",
        left: dels[k] ?? null,
        right: adds[k] ?? null,
      });
    }
  }

  return rows;
}
