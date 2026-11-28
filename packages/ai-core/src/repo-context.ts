const BLOCKED_EXACT_BASENAMES = new Set([
  ".env",
  ".env.local",
  ".env.development",
  ".env.production",
  ".env.test",
  ".env.staging",
  ".npmrc",
  ".netrc",
  ".pypirc",
  "id_rsa",
  "id_dsa",
  "id_ed25519",
  "id_ecdsa",
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lockb",
]);

const BLOCKED_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
  ".jks",
  ".keystore",
  ".crt",
  ".der",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".svg",
  ".pdf",
  ".zip",
  ".tar",
  ".gz",
  ".tgz",
  ".7z",
  ".rar",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".mp3",
  ".mp4",
  ".mov",
  ".avi",
  ".webm",
  ".wasm",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
]);

const BLOCKED_DIR_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".cache",
  ".venv",
  "venv",
  "__pycache__",
]);

const SENSITIVE_BASENAME_RE =
  /^(\.env(\..+)?|credentials(\..+)?|secrets?(\..+)?|service-account(\..+)?\.json)$/i;

export function normalizeRepoRelativePath(raw: string): string | null {
  const cleaned = raw.trim().replace(/^(\.\/)+/, "");
  if (!cleaned || cleaned.includes("\0") || cleaned.includes("\\")) {
    return null;
  }
  if (cleaned.startsWith("/") || /^[A-Za-z]:/.test(cleaned)) {
    return null;
  }
  const segments = cleaned.split("/");
  if (segments.some((seg) => !seg || seg === "." || seg === "..")) {
    return null;
  }
  return segments.join("/");
}

export function isSensitiveOrBlockedPath(rawPath: string, allowLockfiles = false): boolean {
  const rel = normalizeRepoRelativePath(rawPath);
  if (!rel) return true;
  const segments = rel.split("/");
  for (const seg of segments.slice(0, -1)) {
    if (BLOCKED_DIR_SEGMENTS.has(seg.toLowerCase())) {
      return true;
    }
  }
  const last = segments[segments.length - 1] ?? "";
  const lower = last.toLowerCase();
  if (BLOCKED_DIR_SEGMENTS.has(lower)) return true;
  if (SENSITIVE_BASENAME_RE.test(lower)) return true;
  if (BLOCKED_EXACT_BASENAMES.has(lower)) {
    if (
      allowLockfiles &&
      (lower === "pnpm-lock.yaml" || lower === "package-lock.json" || lower === "yarn.lock")
    ) {
      return false;
    }
    return true;
  }
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx !== -1) {
    const ext = lower.slice(dotIdx);
    if (BLOCKED_EXTENSIONS.has(ext)) {
      return true;
    }
  }
  return false;
}

export function parseGitignoreRules(gitignoreText: string | null | undefined): string[] {
  if (!gitignoreText) return [];
  return gitignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("!"));
}

function globMatches(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`, "i").test(value);
}

export function matchesGitignore(relPath: string, rules: string[]): boolean {
  const normalized = normalizeRepoRelativePath(relPath);
  if (!normalized) return true;
  const base = normalized.split("/").pop() ?? normalized;
  for (const rawRule of rules) {
    const trimmed = rawRule.replace(/^\//, "").replace(/\/$/, "");
    if (!trimmed) continue;
    if (normalized === trimmed || normalized.startsWith(`${trimmed}/`)) {
      return true;
    }
    if (!trimmed.includes("/") && (base === trimmed || globMatches(trimmed, base))) {
      return true;
    }
    if (globMatches(trimmed, normalized)) {
      return true;
    }
  }
  return false;
}

export interface RepoTreeCandidate {
  path: string;
  size?: number;
  type?: string;
}

export interface ContextSelectionInput {
  tree: RepoTreeCandidate[];
  gitignoreText?: string | null;
  taskTitle: string;
  taskDescription?: string | null;
  taskLabels?: string[];
  userInstructions?: string | null;
  maxFiles: number;
}

function tokenizeTaskKeywords(input: ContextSelectionInput): Set<string> {
  const combined = [
    input.taskTitle,
    input.taskDescription ?? "",
    (input.taskLabels ?? []).join(" "),
    input.userInstructions ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const matches = combined.match(/[a-z0-9_-]{3,}/g) ?? [];
  return new Set(matches);
}

export function selectRepositoryContextCandidates(input: ContextSelectionInput): {
  indexedFileCount: number;
  selectedPaths: string[];
  excludedCount: number;
} {
  const gitignoreRules = parseGitignoreRules(input.gitignoreText);
  const keywords = tokenizeTaskKeywords(input);

  const blobs = input.tree.filter((item) => !item.type || item.type === "blob");
  const eligible: Array<{ path: string; score: number }> = [];
  let excludedCount = 0;

  for (const item of blobs) {
    const normalized = normalizeRepoRelativePath(item.path);
    if (!normalized) {
      excludedCount += 1;
      continue;
    }
    if (isSensitiveOrBlockedPath(normalized) || matchesGitignore(normalized, gitignoreRules)) {
      excludedCount += 1;
      continue;
    }
    if (typeof item.size === "number" && item.size > 160_000) {
      excludedCount += 1;
      continue;
    }

    const lower = normalized.toLowerCase();
    let score = 0;

    if (lower === "package.json" || lower === "readme.md" || lower === "tsconfig.json") {
      score += 40;
    }
    if (lower.startsWith("src/") || lower.includes("/src/")) {
      score += 18;
    }
    if (lower.endsWith(".ts") || lower.endsWith(".tsx") || lower.endsWith(".js") || lower.endsWith(".py") || lower.endsWith(".go")) {
      score += 10;
    }
    if (lower.includes(".test.") || lower.includes(".spec.") || lower.startsWith("test/")) {
      score += 6;
    }

    for (const kw of keywords) {
      if (lower.includes(kw)) {
        score += 25;
      }
    }

    // Penalize deeply nested files slightly so concise entrypoints float up when tied
    score -= normalized.split("/").length;

    eligible.push({ path: normalized, score });
  }

  eligible.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    indexedFileCount: blobs.length,
    selectedPaths: eligible.slice(0, input.maxFiles).map((item) => item.path),
    excludedCount,
  };
}

export function truncateContextFileContent(content: string, maxChars: number): {
  text: string;
  truncated: boolean;
} {
  if (content.length <= maxChars) {
    return { text: content, truncated: false };
  }
  const marker = "\n... [TRUNCATED BY DEVCOLLAB CONTEXT LIMIT] ...\n";
  const head = Math.max(256, maxChars - marker.length);
  return {
    text: content.slice(0, head) + marker,
    truncated: true,
  };
}

export function frameUntrustedRepoFiles(
  files: Array<{ path: string; content: string }>,
): string {
  return files
    .map(
      (file) =>
        `<UNTRUSTED_REPO_FILE path="${file.path.replace(/"/g, "")}">\n${file.content}\n</UNTRUSTED_REPO_FILE>`,
    )
    .join("\n\n");
}
