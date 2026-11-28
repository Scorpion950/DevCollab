import { mkdir, lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PullRequestChangedFileDto } from "@devcollab/shared";
import { isSensitiveOrBlockedPath, normalizeRepoRelativePath } from "./repo-context.js";

export const DEFAULT_PATCH_LIMITS = {
  maxBytes: 250_000,
  maxFiles: 25,
  maxChangedLines: 4_000,
};

export interface ParsedPatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
}

export interface ParsedPatchFile {
  oldPath: string | null;
  newPath: string | null;
  status: "added" | "removed" | "modified" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patchText: string;
  hunks: ParsedPatchHunk[];
}

export interface ValidatedPatchResult {
  rawPatch: string;
  files: ParsedPatchFile[];
  changedFiles: PullRequestChangedFileDto[];
  filesChangedCount: number;
  additionsCount: number;
  deletionsCount: number;
}

export class PatchValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PatchValidationError";
  }
}

const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/;

function stripGitPrefix(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "/dev/null") return "/dev/null";
  if (trimmed.startsWith("a/") || trimmed.startsWith("b/")) {
    return trimmed.slice(2);
  }
  return trimmed;
}

function validateSafePatchPath(rawPath: string | null): string {
  if (!rawPath) {
    throw new PatchValidationError("Patch section is missing a target file path.");
  }
  const normalized = normalizeRepoRelativePath(rawPath);
  if (!normalized) {
    throw new PatchValidationError(`Rejected unsafe or invalid path in patch: ${rawPath}`);
  }
  if (isSensitiveOrBlockedPath(normalized, true)) {
    throw new PatchValidationError(`Rejected modification to restricted path in patch: ${normalized}`);
  }
  return normalized;
}

function splitDiffSections(normalizedPatch: string): string[] {
  const lines = normalizedPatch.split("\n");
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    const startsNewDiffGit = line.startsWith("diff --git ");
    const startsBareFileHeader =
      !normalizedPatch.includes("diff --git ") &&
      line.startsWith("--- ") &&
      current.some((entry) => entry.startsWith("@@ "));

    if ((startsNewDiffGit || startsBareFileHeader) && current.length > 0) {
      sections.push(current.join("\n"));
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    sections.push(current.join("\n"));
  }
  return sections.filter((section) => section.trim().length > 0);
}

function parseSection(section: string): ParsedPatchFile {
  const lines = section.split("\n");
  let oldPathRaw: string | null = null;
  let newPathRaw: string | null = null;
  let explicitNewFile = false;
  let explicitDeletedFile = false;
  let renameFrom: string | null = null;
  let renameTo: string | null = null;

  for (const line of lines) {
    if (line.startsWith("GIT binary patch") || line.startsWith("Binary files ")) {
      throw new PatchValidationError("Binary diffs are not permitted in AI proposals.");
    }
    if (/^(new|deleted|old)?\s*file mode 120000/.test(line) || /\s120000$/.test(line)) {
      throw new PatchValidationError("Symlink mode changes (120000) are not permitted.");
    }
    if (line.startsWith("diff --git ")) {
      const rest = line.slice("diff --git ".length).trim();
      const parts = rest.split(/\s+/);
      if (parts.length === 2 && parts[0]?.startsWith("a/") && parts[1]?.startsWith("b/")) {
        oldPathRaw = parts[0].slice(2);
        newPathRaw = parts[1].slice(2);
      }
    } else if (line.startsWith("new file mode ")) {
      explicitNewFile = true;
    } else if (line.startsWith("deleted file mode ")) {
      explicitDeletedFile = true;
    } else if (line.startsWith("rename from ")) {
      renameFrom = line.slice("rename from ".length).trim();
    } else if (line.startsWith("rename to ")) {
      renameTo = line.slice("rename to ".length).trim();
    } else if (line.startsWith("--- ")) {
      oldPathRaw = stripGitPrefix(line.slice(4));
    } else if (line.startsWith("+++ ")) {
      newPathRaw = stripGitPrefix(line.slice(4));
    }
  }

  const hunks: ParsedPatchHunk[] = [];
  const hunkTextLines: string[] = [];
  let additions = 0;
  let deletions = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.startsWith("@@ ")) {
      i += 1;
      continue;
    }
    const match = HUNK_HEADER_RE.exec(line);
    if (!match) {
      throw new PatchValidationError(`Malformed unified diff hunk header: ${line}`);
    }
    const oldStart = Number(match[1]);
    const oldCount = match[2] === undefined ? 1 : Number(match[2]);
    const newStart = Number(match[3]);
    const newCount = match[4] === undefined ? 1 : Number(match[4]);

    hunkTextLines.push(line);
    const body: string[] = [];
    let observedOld = 0;
    let observedNew = 0;
    i += 1;

    while (i < lines.length) {
      const current = lines[i] ?? "";
      if (current.startsWith("@@ ") || current.startsWith("diff --git ")) {
        break;
      }
      if (current === "\\ No newline at end of file") {
        i += 1;
        continue;
      }
      if (current.startsWith("+")) {
        additions += 1;
        observedNew += 1;
        body.push(current);
        hunkTextLines.push(current);
        i += 1;
      } else if (current.startsWith("-")) {
        deletions += 1;
        observedOld += 1;
        body.push(current);
        hunkTextLines.push(current);
        i += 1;
      } else if (current.startsWith(" ")) {
        observedOld += 1;
        observedNew += 1;
        body.push(current);
        hunkTextLines.push(current);
        i += 1;
      } else if (current === "" && i === lines.length - 1) {
        // Trailing newline artifact at end of section
        i += 1;
      } else {
        throw new PatchValidationError(`Unexpected line inside diff hunk: ${current}`);
      }
    }

    if (observedOld !== oldCount || observedNew !== newCount) {
      throw new PatchValidationError(
        `Hunk line count mismatch (expected -${oldCount},+${newCount}, got -${observedOld},+${observedNew}).`,
      );
    }

    hunks.push({ oldStart, oldCount, newStart, newCount, lines: body });
  }

  const isAdded = explicitNewFile || oldPathRaw === "/dev/null";
  const isRemoved = explicitDeletedFile || newPathRaw === "/dev/null";
  const isRenamed = Boolean(renameFrom && renameTo);

  if (hunks.length === 0 && !isRenamed) {
    throw new PatchValidationError("Patch file section contains no diff hunks.");
  }

  if (isAdded && isRemoved) {
    throw new PatchValidationError("Patch file cannot simultaneously be added and deleted.");
  }

  let status: ParsedPatchFile["status"];
  let oldPath: string | null = null;
  let newPath: string | null = null;

  if (isAdded) {
    status = "added";
    newPath = validateSafePatchPath(newPathRaw);
  } else if (isRemoved) {
    status = "removed";
    oldPath = validateSafePatchPath(oldPathRaw);
  } else if (isRenamed) {
    status = "renamed";
    oldPath = validateSafePatchPath(renameFrom);
    newPath = validateSafePatchPath(renameTo);
  } else {
    status = "modified";
    oldPath = validateSafePatchPath(oldPathRaw);
    newPath = validateSafePatchPath(newPathRaw);
    if (oldPath !== newPath) {
      status = "renamed";
    }
  }

  const patchText = hunkTextLines.join("\n");

  return {
    oldPath,
    newPath,
    status,
    additions,
    deletions,
    changes: additions + deletions,
    patchText,
    hunks,
  };
}

export function validateAndParseUnifiedDiff(
  rawPatchInput: string,
  limits = DEFAULT_PATCH_LIMITS,
): ValidatedPatchResult {
  if (typeof rawPatchInput !== "string") {
    throw new PatchValidationError("Generated patch must be a string.");
  }

  const rawPatch = rawPatchInput.replace(/\r\n/g, "\n").trim();
  if (!rawPatch) {
    throw new PatchValidationError("Generated patch is empty.");
  }
  if (rawPatch.includes("\0")) {
    throw new PatchValidationError("Patch contains NUL bytes.");
  }
  if (Buffer.byteLength(rawPatch, "utf8") > limits.maxBytes) {
    throw new PatchValidationError(
      `Generated patch exceeds maximum allowed size (${limits.maxBytes} bytes).`,
    );
  }

  const sections = splitDiffSections(rawPatch);
  if (sections.length === 0) {
    throw new PatchValidationError("Patch does not contain any valid unified diff sections.");
  }
  if (sections.length > limits.maxFiles) {
    throw new PatchValidationError(
      `Patch touches ${sections.length} files, exceeding the ${limits.maxFiles}-file safety limit.`,
    );
  }

  const files: ParsedPatchFile[] = [];
  const seenTargets = new Set<string>();
  let totalChangedLines = 0;
  let additionsCount = 0;
  let deletionsCount = 0;

  for (const section of sections) {
    const parsed = parseSection(section);
    const primaryTarget = parsed.newPath ?? parsed.oldPath ?? "";
    if (seenTargets.has(primaryTarget)) {
      throw new PatchValidationError(`Duplicate patch section for path: ${primaryTarget}`);
    }
    seenTargets.add(primaryTarget);
    totalChangedLines += parsed.changes;
    additionsCount += parsed.additions;
    deletionsCount += parsed.deletions;
    files.push(parsed);
  }

  if (totalChangedLines > limits.maxChangedLines) {
    throw new PatchValidationError(
      `Patch changes ${totalChangedLines} lines, exceeding the ${limits.maxChangedLines}-line safety limit.`,
    );
  }

  const changedFiles: PullRequestChangedFileDto[] = files.map((file) => {
    const filename = file.newPath ?? file.oldPath ?? "unknown";
    const lineCount = file.patchText ? file.patchText.split("\n").length : 0;
    return {
      sha: null,
      filename,
      previousFilename:
        file.status === "renamed" && file.oldPath && file.oldPath !== filename ? file.oldPath : null,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      changes: file.changes,
      patch: file.patchText || null,
      isBinary: false,
      isTruncated: false,
      isLarge: lineCount > 400,
      lineCount,
      blobUrl: null,
    };
  });

  return {
    rawPatch,
    files,
    changedFiles,
    filesChangedCount: files.length,
    additionsCount,
    deletionsCount,
  };
}

async function resolveContainedFilePath(rootDir: string, relPath: string): Promise<string> {
  const realRoot = await realpath(rootDir);
  const candidate = path.resolve(realRoot, relPath);
  if (candidate !== realRoot && !candidate.startsWith(`${realRoot}${path.sep}`)) {
    throw new PatchValidationError(`Path escapes repository workspace: ${relPath}`);
  }
  return candidate;
}

async function assertNoSymlinkSegments(rootDir: string, relPath: string): Promise<void> {
  const parts = relPath.split("/").filter(Boolean);
  let cursor = rootDir;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    try {
      const stat = await lstat(cursor);
      if (stat.isSymbolicLink()) {
        throw new PatchValidationError(`Symlink encountered in patch target path: ${relPath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        continue;
      }
      throw error;
    }
  }
}

function applyHunksToLines(originalLines: string[], hunks: ParsedPatchHunk[], targetPath: string): string {
  const result = [...originalLines];
  let offset = 0;

  for (const hunk of hunks) {
    const startIdx = Math.max(0, hunk.oldStart - 1 + offset);
    let cursor = startIdx;

    for (const diffLine of hunk.lines) {
      const prefix = diffLine[0];
      const text = diffLine.slice(1);
      if (prefix === " ") {
        if (result[cursor] !== text) {
          throw new PatchValidationError(
            `Context mismatch while applying patch to ${targetPath} near line ${hunk.oldStart}.`,
          );
        }
        cursor += 1;
      } else if (prefix === "-") {
        if (result[cursor] !== text) {
          throw new PatchValidationError(
            `Deletion mismatch while applying patch to ${targetPath} near line ${hunk.oldStart}.`,
          );
        }
        result.splice(cursor, 1);
        offset -= 1;
      } else if (prefix === "+") {
        result.splice(cursor, 0, text);
        cursor += 1;
        offset += 1;
      }
    }
  }

  return `${result.join("\n")}\n`.replace(/\n\n$/, "\n");
}

export async function applyValidatedPatchToDirectory(
  workDir: string,
  validated: ValidatedPatchResult,
): Promise<void> {
  for (const file of validated.files) {
    if (file.status === "added" && file.newPath) {
      const target = await resolveContainedFilePath(workDir, file.newPath);
      await assertNoSymlinkSegments(workDir, file.newPath);
      await mkdir(path.dirname(target), { recursive: true });
      const content = applyHunksToLines([], file.hunks, file.newPath);
      await writeFile(target, content, "utf8");
      continue;
    }

    if (file.status === "removed" && file.oldPath) {
      const target = await resolveContainedFilePath(workDir, file.oldPath);
      await assertNoSymlinkSegments(workDir, file.oldPath);
      await rm(target, { force: true });
      continue;
    }

    if (file.status === "renamed" && file.oldPath && file.newPath) {
      const src = await resolveContainedFilePath(workDir, file.oldPath);
      const dest = await resolveContainedFilePath(workDir, file.newPath);
      await assertNoSymlinkSegments(workDir, file.oldPath);
      await assertNoSymlinkSegments(workDir, file.newPath);
      const raw = await readFile(src, "utf8");
      const baseLines = raw.replace(/\r\n/g, "\n").split("\n");
      if (baseLines[baseLines.length - 1] === "") baseLines.pop();
      const updated =
        file.hunks.length > 0 ? applyHunksToLines(baseLines, file.hunks, file.newPath) : raw;
      await mkdir(path.dirname(dest), { recursive: true });
      await writeFile(dest, updated, "utf8");
      if (src !== dest) {
        await rm(src, { force: true });
      }
      continue;
    }

    if (file.status === "modified" && file.newPath) {
      const target = await resolveContainedFilePath(workDir, file.newPath);
      await assertNoSymlinkSegments(workDir, file.newPath);
      const raw = await readFile(target, "utf8");
      const baseLines = raw.replace(/\r\n/g, "\n").split("\n");
      if (baseLines[baseLines.length - 1] === "") baseLines.pop();
      const updated = applyHunksToLines(baseLines, file.hunks, file.newPath);
      await writeFile(target, updated, "utf8");
    }
  }
}
