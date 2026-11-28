import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  applyValidatedPatchToDirectory,
  extractSafeTarGz,
  isSensitiveOrBlockedPath,
  normalizeRepoRelativePath,
  scrubSecrets,
  validateAndParseUnifiedDiff,
} from "@devcollab/ai-core";
import type {
  PullRequestChangedFileDto,
  WorkspaceFileContentDto,
  WorkspaceGitCommitDto,
  WorkspaceGitDiffDto,
  WorkspaceGitFileChangeDto,
  WorkspaceGitStatusDto,
  WorkspaceSearchMatchDto,
  WorkspaceTreeEntryDto,
} from "@devcollab/shared";

const execFileAsync = promisify(execFile);

export class WorkspaceFsError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
    public readonly conflictFiles?: string[],
  ) {
    super(message);
    this.name = "WorkspaceFsError";
  }
}

const PATH_KEY_RE = /^[a-zA-Z0-9_-]{6,96}$/;
const BRANCH_NAME_RE = /^[a-zA-Z0-9._/-]{1,80}$/;
const GIT_SHA_RE = /^[a-f0-9]{7,64}$/i;

const SECRET_FILE_RE =
  /^(\.env(\..+)?|credentials(\..+)?|secrets?(\..+)?|service-account(\..+)?\.json|id_rsa(\..+)?|id_ed25519(\..+)?|id_dsa(\..+)?)$/i;
const SECRET_EXT_RE = /\.(pem|key|p12|pfx|jks|keystore)$/i;

const MINIMAL_GIT_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  HOME: process.env.HOME ?? process.env.USERPROFILE,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "",
  LC_ALL: "C",
};

function detectLanguage(filePath: string): string {
  const lower = filePath.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  if (lower.endsWith(".ts") || lower.endsWith(".tsx")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".jsx") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".css")) return "css";
  if (lower.endsWith(".scss")) return "scss";
  if (lower.endsWith(".html")) return "html";
  if (lower.endsWith(".yml") || lower.endsWith(".yaml")) return "yaml";
  if (lower.endsWith(".sql")) return "sql";
  if (lower.endsWith(".prisma")) return "prisma";
  if (lower.endsWith(".py")) return "python";
  if (lower.endsWith(".go")) return "go";
  if (lower.endsWith(".rs")) return "rust";
  if (lower.endsWith(".sh") || lower.endsWith(".bash")) return "shell";
  if (base === "dockerfile") return "dockerfile";
  return "plaintext";
}

function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function assertSafeEditablePath(rawPath: string): string {
  const normalized = normalizeRepoRelativePath(rawPath);
  if (!normalized) {
    throw new WorkspaceFsError(`Invalid or unsafe workspace path: ${rawPath}`, 400, "UNSAFE_PATH");
  }
  const segments = normalized.split("/");
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (lower === ".git") {
      throw new WorkspaceFsError("Access to .git internal metadata is not allowed.", 403, "FORBIDDEN_PATH");
    }
    if (SECRET_FILE_RE.test(lower) || SECRET_EXT_RE.test(lower)) {
      throw new WorkspaceFsError(`Access to restricted credential file (${seg}) is blocked.`, 403, "RESTRICTED_SECRET_PATH");
    }
  }
  return normalized;
}

async function execGit(repoDir: string, args: string[], timeoutMs = 20_000): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd: repoDir,
      env: MINIMAL_GIT_ENV,
      timeout: timeoutMs,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return String(stdout ?? "");
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const msg = scrubSecrets(String(err.stderr || err.message || "Git operation failed."));
    throw new WorkspaceFsError(msg.slice(0, 500), 400, "GIT_ERROR");
  }
}

export class WorkspaceFilesystemService {
  constructor(
    private readonly rootDir: string,
    private readonly snapshotDir: string,
    private readonly maxFileBytes = 524_288,
  ) {}

  private validatePathKey(pathKey: string): string {
    if (!PATH_KEY_RE.test(pathKey)) {
      throw new WorkspaceFsError("Invalid workspace path key.", 400, "INVALID_PATH_KEY");
    }
    return pathKey;
  }

  private getWorkspaceBaseDir(pathKey: string): string {
    const safeKey = this.validatePathKey(pathKey);
    const resolvedRoot = path.resolve(this.rootDir);
    const candidate = path.resolve(resolvedRoot, safeKey);
    if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) {
      throw new WorkspaceFsError("Workspace path escapes storage root.", 403, "WORKSPACE_ESCAPE");
    }
    return candidate;
  }

  private getRepoDir(pathKey: string): string {
    return path.join(this.getWorkspaceBaseDir(pathKey), "repo");
  }

  async checkGitAvailable(): Promise<boolean> {
    try {
      await execFileAsync("git", ["--version"], { timeout: 2500, windowsHide: true });
      return true;
    } catch {
      return false;
    }
  }

  async exists(pathKey: string): Promise<boolean> {
    try {
      await this.requireExistingRepoDir(pathKey);
      return true;
    } catch {
      return false;
    }
  }

  async requireExistingRepoDir(pathKey: string): Promise<string> {
    const repoDir = this.getRepoDir(pathKey);
    try {
      await access(repoDir);
      const rootStat = await lstat(repoDir);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        throw new Error("Invalid workspace directory");
      }
      return await realpath(repoDir);
    } catch {
      throw new WorkspaceFsError("Workspace directory is not present on worker.", 404, "WORKSPACE_MISSING");
    }
  }

  private async resolveContainedPath(
    repoDir: string,
    relPath: string,
    options: { mustExist?: boolean } = {},
  ): Promise<string> {
    const cleanRel = assertSafeEditablePath(relPath);
    const realRoot = await realpath(repoDir);
    const segments = cleanRel.split("/");
    let cursor = realRoot;

    for (let i = 0; i < segments.length; i += 1) {
      cursor = path.join(cursor, segments[i]!);
      try {
        const st = await lstat(cursor);
        if (st.isSymbolicLink()) {
          throw new WorkspaceFsError(`Symlink access rejected in path: ${cleanRel}`, 403, "SYMLINK_REJECTED");
        }
        const resolvedCursor = await realpath(cursor);
        if (resolvedCursor !== realRoot && !resolvedCursor.startsWith(`${realRoot}${path.sep}`)) {
          throw new WorkspaceFsError(`Path escapes repository boundary: ${cleanRel}`, 403, "PATH_ESCAPE");
        }
      } catch (error) {
        if (error instanceof WorkspaceFsError) throw error;
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          if (options.mustExist) {
            throw new WorkspaceFsError(`Path does not exist: ${cleanRel}`, 404, "NOT_FOUND");
          }
          continue;
        }
        throw error;
      }
    }

    const finalTarget = path.resolve(realRoot, cleanRel);
    if (finalTarget !== realRoot && !finalTarget.startsWith(`${realRoot}${path.sep}`)) {
      throw new WorkspaceFsError(`Path escapes repository boundary: ${cleanRel}`, 403, "PATH_ESCAPE");
    }
    return finalTarget;
  }

  async initializeFromTarball(input: {
    pathKey: string;
    tarballBuffer: Buffer;
    repoFullName: string;
    baseBranch: string;
    baseCommitSha: string;
  }): Promise<{ fileCount: number; totalBytes: number; headSha: string }> {
    const baseDir = this.getWorkspaceBaseDir(input.pathKey);
    const repoDir = this.getRepoDir(input.pathKey);
    await mkdir(this.rootDir, { recursive: true });
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(repoDir, { recursive: true });

    const extracted = await extractSafeTarGz(input.tarballBuffer, repoDir);
    const branch = BRANCH_NAME_RE.test(input.baseBranch) ? input.baseBranch : "main";

    await execGit(repoDir, ["init"]);
    await execGit(repoDir, ["config", "user.name", "DevCollab Workspace"]);
    await execGit(repoDir, ["config", "user.email", "workspace@devcollab.local"]);
    await execGit(repoDir, ["config", "core.autocrlf", "false"]);
    await execGit(repoDir, ["checkout", "-B", branch]);
    await execGit(repoDir, ["add", "-A"]);
    await execGit(repoDir, [
      "commit",
      "--allow-empty",
      "-m",
      `chore: baseline ${input.repoFullName}@${input.baseCommitSha.slice(0, 7)}`,
    ]);
    const headSha = (await execGit(repoDir, ["rev-parse", "HEAD"])).trim();

    return { fileCount: extracted.fileCount, totalBytes: extracted.totalBytes, headSha };
  }

  async deleteWorkspaceDir(pathKey: string): Promise<void> {
    const baseDir = this.getWorkspaceBaseDir(pathKey);
    await rm(baseDir, { recursive: true, force: true });
  }

  async listTree(pathKey: string): Promise<WorkspaceTreeEntryDto[]> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    let visited = 0;
    const maxEntries = 2500;

    async function walk(absDir: string, relPrefix: string, depth: number): Promise<WorkspaceTreeEntryDto[]> {
      if (depth > 10 || visited >= maxEntries) return [];
      const dirents = await readdir(absDir, { withFileTypes: true });
      const items: WorkspaceTreeEntryDto[] = [];

      for (const d of dirents) {
        if (visited >= maxEntries) break;
        if (d.name === ".git" || d.name === "node_modules" || d.isSymbolicLink()) continue;
        if (SECRET_FILE_RE.test(d.name) || SECRET_EXT_RE.test(d.name)) continue;

        const relPath = relPrefix ? `${relPrefix}/${d.name}` : d.name;
        const absPath = path.join(absDir, d.name);
        visited += 1;

        if (d.isDirectory()) {
          const children = await walk(absPath, relPath, depth + 1);
          items.push({
            name: d.name,
            path: relPath,
            type: "directory",
            size: 0,
            isBinary: false,
            children,
          });
        } else if (d.isFile()) {
          const st = await stat(absPath).catch(() => null);
          const binaryGuess = isSensitiveOrBlockedPath(relPath) && /\.[a-z0-9]+$/i.test(d.name);
          items.push({
            name: d.name,
            path: relPath,
            type: "file",
            size: st?.size ?? 0,
            isBinary: binaryGuess,
          });
        }
      }

      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return items;
    }

    return walk(repoDir, "", 0);
  }

  async readFile(pathKey: string, relPath: string): Promise<WorkspaceFileContentDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const target = await this.resolveContainedPath(repoDir, relPath, { mustExist: true });
    const st = await lstat(target);
    if (!st.isFile()) {
      throw new WorkspaceFsError("Target path is not a file.", 400, "NOT_A_FILE");
    }

    const cleanRel = assertSafeEditablePath(relPath);
    const name = path.posix.basename(cleanRel);
    if (st.size > this.maxFileBytes) {
      return {
        path: cleanRel,
        name,
        content: "",
        versionHash: "",
        size: st.size,
        isBinary: false,
        isTooLarge: true,
        language: detectLanguage(cleanRel),
      };
    }

    const buf = await readFile(target);
    const isBinary = buf.includes(0);
    return {
      path: cleanRel,
      name,
      content: isBinary ? "" : buf.toString("utf8"),
      versionHash: sha256Buffer(buf),
      size: buf.byteLength,
      isBinary,
      isTooLarge: false,
      language: detectLanguage(cleanRel),
    };
  }

  async writeFile(input: {
    pathKey: string;
    path: string;
    content: string;
    expectedVersionHash?: string | null;
    skipConflictCheck?: boolean;
  }): Promise<{ path: string; versionHash: string; size: number }> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const cleanRel = assertSafeEditablePath(input.path);
    const buf = Buffer.from(input.content, "utf8");
    if (buf.byteLength > this.maxFileBytes) {
      throw new WorkspaceFsError(
        `File exceeds maximum editable size (${this.maxFileBytes} bytes).`,
        413,
        "FILE_TOO_LARGE",
      );
    }

    const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: true });
    const currentBuf = await readFile(target);
    if (currentBuf.includes(0)) {
      throw new WorkspaceFsError("Binary files cannot be overwritten as text.", 400, "BINARY_FILE");
    }
    const currentHash = sha256Buffer(currentBuf);
    if (!input.skipConflictCheck && input.expectedVersionHash && input.expectedVersionHash !== currentHash) {
      throw new WorkspaceFsError(
        "File conflict: this file was modified externally since you opened it. Reload before saving.",
        409,
        "FILE_VERSION_CONFLICT",
      );
    }

    await writeFile(target, buf);
    return { path: cleanRel, versionHash: sha256Buffer(buf), size: buf.byteLength };
  }

  async createFile(input: { pathKey: string; path: string; content?: string }): Promise<WorkspaceFileContentDto> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const cleanRel = assertSafeEditablePath(input.path);
    const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: false });
    try {
      await lstat(target);
      throw new WorkspaceFsError(`File or folder already exists: ${cleanRel}`, 409, "ALREADY_EXISTS");
    } catch (err) {
      if (err instanceof WorkspaceFsError) throw err;
    }

    const buf = Buffer.from(input.content ?? "", "utf8");
    if (buf.byteLength > this.maxFileBytes) {
      throw new WorkspaceFsError("File exceeds size limit.", 413, "FILE_TOO_LARGE");
    }
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buf);
    return {
      path: cleanRel,
      name: path.posix.basename(cleanRel),
      content: buf.toString("utf8"),
      versionHash: sha256Buffer(buf),
      size: buf.byteLength,
      isBinary: false,
      isTooLarge: false,
      language: detectLanguage(cleanRel),
    };
  }

  async createFolder(input: { pathKey: string; path: string }): Promise<{ path: string }> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const cleanRel = assertSafeEditablePath(input.path);
    const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: false });
    await mkdir(target, { recursive: true });
    return { path: cleanRel };
  }

  async renameEntry(input: { pathKey: string; oldPath: string; newPath: string }): Promise<{ oldPath: string; newPath: string }> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const cleanOld = assertSafeEditablePath(input.oldPath);
    const cleanNew = assertSafeEditablePath(input.newPath);
    const src = await this.resolveContainedPath(repoDir, cleanOld, { mustExist: true });
    const dest = await this.resolveContainedPath(repoDir, cleanNew, { mustExist: false });
    try {
      await lstat(dest);
      throw new WorkspaceFsError(`Target already exists: ${cleanNew}`, 409, "ALREADY_EXISTS");
    } catch (err) {
      if (err instanceof WorkspaceFsError) throw err;
    }
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(src, dest);
    return { oldPath: cleanOld, newPath: cleanNew };
  }

  async deleteEntry(input: { pathKey: string; path: string; confirmNonEmpty?: boolean }): Promise<{ path: string; deletedDirectory: boolean }> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const cleanRel = assertSafeEditablePath(input.path);
    const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: true });
    const st = await lstat(target);

    if (st.isDirectory()) {
      const children = await readdir(target);
      if (children.length > 0 && !input.confirmNonEmpty) {
        throw new WorkspaceFsError(
          "Directory is not empty. Explicit confirmation is required before deleting.",
          409,
          "NON_EMPTY_DIRECTORY",
        );
      }
      await rm(target, { recursive: true, force: true });
      return { path: cleanRel, deletedDirectory: true };
    }

    await rm(target, { force: true });
    return { path: cleanRel, deletedDirectory: false };
  }

  async searchWorkspace(pathKey: string, query: string, mode: "files" | "text" = "files"): Promise<WorkspaceSearchMatchDto[]> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const q = query.trim().toLowerCase();
    if (!q) return [];

    const results: WorkspaceSearchMatchDto[] = [];
    const maxResults = 60;
    let filesScanned = 0;

    async function walk(absDir: string, relPrefix: string, depth: number) {
      if (depth > 9 || results.length >= maxResults || filesScanned > 1500) return;
      const dirents = await readdir(absDir, { withFileTypes: true });
      for (const d of dirents) {
        if (results.length >= maxResults || filesScanned > 1500) break;
        if (d.name === ".git" || d.name === "node_modules" || d.isSymbolicLink()) continue;
        if (SECRET_FILE_RE.test(d.name) || SECRET_EXT_RE.test(d.name)) continue;

        const relPath = relPrefix ? `${relPrefix}/${d.name}` : d.name;
        const absPath = path.join(absDir, d.name);
        if (d.isDirectory()) {
          await walk(absPath, relPath, depth + 1);
          continue;
        }
        if (!d.isFile()) continue;
        filesScanned += 1;

        if (mode === "files") {
          if (relPath.toLowerCase().includes(q)) {
            results.push({ path: relPath, name: d.name, lineNumber: null, preview: null });
          }
          continue;
        }

        const st = await stat(absPath).catch(() => null);
        if (!st || st.size > 131_072) continue;
        const buf = await readFile(absPath).catch(() => null);
        if (!buf || buf.includes(0)) continue;
        const lines = buf.toString("utf8").split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          if (lines[i]!.toLowerCase().includes(q)) {
            results.push({
              path: relPath,
              name: d.name,
              lineNumber: i + 1,
              preview: lines[i]!.trim().slice(0, 140),
            });
            if (results.length >= maxResults) break;
          }
        }
      }
    }

    await walk(repoDir, "", 0);
    return results;
  }

  async getGitStatus(pathKey: string): Promise<WorkspaceGitStatusDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const [branchOut, headShaOut, branchesOut, porcelainOut, logOut] = await Promise.all([
      execGit(repoDir, ["rev-parse", "--abbrev-ref", "HEAD"]),
      execGit(repoDir, ["rev-parse", "HEAD"]),
      execGit(repoDir, ["branch", "--format=%(refname:short)"]),
      execGit(repoDir, ["status", "--porcelain=v1", "-z", "-uall"]),
      execGit(repoDir, ["log", "-n", "12", "--pretty=format:%H\x1f%h\x1f%s\x1f%an\x1f%aI"]).catch(
        () => "",
      ),
    ]);

    const files: WorkspaceGitFileChangeDto[] = [];
    const tokens = porcelainOut.split("\0").filter((entry) => entry.length > 0);
    let idx = 0;
    let stagedCount = 0;
    let unstagedCount = 0;
    let untrackedCount = 0;

    while (idx < tokens.length) {
      const entry = tokens[idx]!;
      idx += 1;
      if (entry.length < 4) continue;
      const x = entry[0]!;
      const y = entry[1]!;
      const filePath = entry.slice(3);
      let previousPath: string | null = null;
      if (x === "R" || x === "C") {
        previousPath = tokens[idx] ?? null;
        idx += 1;
      }

      const untracked = x === "?" && y === "?";
      const stagedStatus = !untracked && x !== " " ? x : null;
      const unstagedStatus = untracked ? "?" : y !== " " ? y : null;

      if (stagedStatus) stagedCount += 1;
      if (untracked) untrackedCount += 1;
      else if (unstagedStatus) unstagedCount += 1;

      files.push({
        path: filePath,
        previousPath,
        stagedStatus,
        unstagedStatus,
        untracked,
      });
    }

    const recentCommits: WorkspaceGitCommitDto[] = logOut
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const [sha = "", shortSha = "", message = "", authorName = "", authoredAt = ""] =
          line.split("\x1f");
        return { sha, shortSha, message, authorName, authoredAt };
      });

    return {
      branch: branchOut.trim(),
      headSha: headShaOut.trim(),
      branches: branchesOut
        .split(/\r?\n/)
        .map((b) => b.trim())
        .filter(Boolean),
      stagedCount,
      unstagedCount,
      untrackedCount,
      files,
      recentCommits,
      remotePushAllowed: false,
    };
  }

  async getGitDiff(
    pathKey: string,
    scope: "unstaged" | "staged" | "commit",
    relPath?: string,
    commitSha?: string,
  ): Promise<WorkspaceGitDiffDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    let cleanRel: string | null = null;
    if (relPath) {
      cleanRel = assertSafeEditablePath(relPath);
    }

    let rawDiff: string;
    if (scope === "commit") {
      if (!commitSha || !GIT_SHA_RE.test(commitSha)) {
        throw new WorkspaceFsError("Valid commit SHA is required.", 400, "INVALID_SHA");
      }
      const args = ["show", "--format=", "--patch", commitSha];
      if (cleanRel) args.push("--", cleanRel);
      rawDiff = await execGit(repoDir, args);
    } else if (scope === "staged") {
      const args = ["diff", "--cached"];
      if (cleanRel) args.push("--", cleanRel);
      rawDiff = await execGit(repoDir, args);
    } else {
      const args = ["diff"];
      if (cleanRel) args.push("--", cleanRel);
      rawDiff = await execGit(repoDir, args);

      // Handle untracked file diff preview safely when git diff returns empty
      if (!rawDiff.trim() && cleanRel) {
        const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: false }).catch(
          () => null,
        );
        if (target) {
          const st = await lstat(target).catch(() => null);
          if (st?.isFile() && st.size <= this.maxFileBytes) {
            const buf = await readFile(target);
            if (!buf.includes(0)) {
              const lines = buf.toString("utf8").replace(/\r\n/g, "\n").split("\n");
              if (lines[lines.length - 1] === "") lines.pop();
              rawDiff = [
                `diff --git a/${cleanRel} b/${cleanRel}`,
                "new file mode 100644",
                "--- /dev/null",
                `+++ b/${cleanRel}`,
                `@@ -0,0 +1,${lines.length} @@`,
                ...lines.map((l) => `+${l}`),
              ].join("\n");
            }
          }
        }
      }
    }

    let files: PullRequestChangedFileDto[] = [];
    if (rawDiff.trim()) {
      try {
        files = validateAndParseUnifiedDiff(rawDiff, {
          maxBytes: 1_000_000,
          maxFiles: 50,
          maxChangedLines: 15_000,
        }).changedFiles;
      } catch {
        files = [];
      }
    }

    return {
      path: cleanRel,
      scope,
      files,
      rawDiff,
    };
  }

  async stageFiles(pathKey: string, paths?: string[]): Promise<WorkspaceGitStatusDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    if (!paths || paths.length === 0) {
      await execGit(repoDir, ["add", "--all"]);
    } else {
      const safePaths = paths.map((p) => assertSafeEditablePath(p));
      await execGit(repoDir, ["add", "--", ...safePaths]);
    }
    return this.getGitStatus(pathKey);
  }

  async unstageFiles(pathKey: string, paths?: string[]): Promise<WorkspaceGitStatusDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    if (!paths || paths.length === 0) {
      await execGit(repoDir, ["reset", "HEAD"]);
    } else {
      const safePaths = paths.map((p) => assertSafeEditablePath(p));
      await execGit(repoDir, ["reset", "HEAD", "--", ...safePaths]);
    }
    return this.getGitStatus(pathKey);
  }

  async commitChanges(pathKey: string, message: string): Promise<{ sha: string; shortSha: string; message: string; status: WorkspaceGitStatusDto }> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const cleaned = message.trim();
    if (cleaned.length < 3 || cleaned.length > 500) {
      throw new WorkspaceFsError("Commit message must be between 3 and 500 characters.", 400, "INVALID_COMMIT_MESSAGE");
    }

    const statusBefore = await this.getGitStatus(pathKey);
    if (statusBefore.stagedCount === 0) {
      throw new WorkspaceFsError("No staged changes to commit. Stage at least one file first.", 400, "NOTHING_STAGED");
    }

    await execGit(repoDir, ["commit", "-m", cleaned]);
    const statusAfter = await this.getGitStatus(pathKey);
    return {
      sha: statusAfter.headSha,
      shortSha: statusAfter.headSha.slice(0, 7),
      message: cleaned,
      status: statusAfter,
    };
  }

  async switchBranch(pathKey: string, branchName: string, createNew = false): Promise<WorkspaceGitStatusDto> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const trimmed = branchName.trim();
    if (
      !BRANCH_NAME_RE.test(trimmed) ||
      trimmed.startsWith("-") ||
      trimmed.includes("..") ||
      trimmed.endsWith(".lock")
    ) {
      throw new WorkspaceFsError("Invalid Git branch name.", 400, "INVALID_BRANCH");
    }
    if (createNew) {
      await execGit(repoDir, ["checkout", "-b", trimmed]);
    } else {
      await execGit(repoDir, ["checkout", trimmed]);
    }
    return this.getGitStatus(pathKey);
  }

  async applyAiPatch(
    pathKey: string,
    rawPatch: string,
    opts?: {
      expectedBaseHashes?: Record<string, string | null>;
      allowDirtyTargetFiles?: boolean;
    },
  ): Promise<{
    filesChanged: number;
    appliedPaths: string[];
    deletedPaths: string[];
    status: WorkspaceGitStatusDto;
  }> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    let validated;
    try {
      validated = validateAndParseUnifiedDiff(rawPatch);
    } catch (err) {
      throw new WorkspaceFsError(
        err instanceof Error ? err.message : "Invalid AI proposal patch.",
        400,
        "INVALID_AI_PATCH",
      );
    }

    if (opts?.expectedBaseHashes) {
      const hashMismatches: string[] = [];
      for (const [relPath, expectedHash] of Object.entries(opts.expectedBaseHashes)) {
        const cleanRel = assertSafeEditablePath(relPath);
        let actualHash: string | null;
        try {
          const target = await this.resolveContainedPath(repoDir, cleanRel, { mustExist: true });
          const currentBuf = await readFile(target);
          actualHash = sha256Buffer(currentBuf);
        } catch {
          actualHash = null;
        }
        if (actualHash !== expectedHash) {
          hashMismatches.push(cleanRel);
        }
      }
      if (hashMismatches.length > 0) {
        throw new WorkspaceFsError(
          `Cannot apply AI patch cleanly because these files changed since the proposal was created: ${hashMismatches.join(", ")}. Refresh or regenerate the proposal against current code.`,
          409,
          "PATCH_CONFLICT",
          hashMismatches,
        );
      }
    }

    const currentStatus = await this.getGitStatus(pathKey);
    if (!opts?.allowDirtyTargetFiles) {
      const dirtySet = new Set(currentStatus.files.map((f) => f.path));
      const conflicts = validated.changedFiles
        .map((f) => f.filename)
        .filter((p) => dirtySet.has(p));

      if (conflicts.length > 0) {
        throw new WorkspaceFsError(
          `Cannot apply AI patch cleanly because these workspace files have uncommitted edits: ${conflicts.join(", ")}. Stage, commit, or revert conflicting edits first.`,
          409,
          "PATCH_CONFLICT",
          conflicts,
        );
      }
    }

    try {
      await applyValidatedPatchToDirectory(repoDir, validated);
    } catch (err) {
      throw new WorkspaceFsError(
        err instanceof Error
          ? `Patch application failed against current workspace files: ${err.message}`
          : "Patch conflict detected while applying AI changes.",
        409,
        "PATCH_CONTEXT_CONFLICT",
      );
    }

    const appliedPaths = validated.files
      .filter((f) => f.status !== "removed")
      .map((f) => f.newPath ?? f.oldPath)
      .filter((p): p is string => Boolean(p));
    const deletedPaths = validated.files
      .filter((f) => f.status === "removed")
      .map((f) => f.oldPath)
      .filter((p): p is string => Boolean(p));

    const nextStatus = await this.getGitStatus(pathKey);
    return {
      filesChanged: validated.filesChangedCount,
      appliedPaths,
      deletedPaths,
      status: nextStatus,
    };
  }

  async createRecoverySnapshot(
    pathKey: string,
    workspaceId: string,
    snapshotId: string,
  ): Promise<{ storageKey: string; sizeBytes: number; checksumSha256: string; trackedFileCount: number; untrackedFileCount: number }> {
    const repoDir = await this.requireExistingRepoDir(pathKey);
    const status = await this.getGitStatus(pathKey);

    const changedTracked = status.files.filter((f) => !f.untracked && f.stagedStatus !== "D" && f.unstagedStatus !== "D");
    const untracked = status.files.filter((f) => f.untracked);

    const { createSafeTarGzFromEntries } = await import("@devcollab/ai-core");
    const tarEntries: Array<{ name: string; data: Buffer }> = [];

    for (const file of [...changedTracked, ...untracked].slice(0, 500)) {
      const abs = await this.resolveContainedPath(repoDir, file.path, { mustExist: true }).catch(() => null);
      if (!abs) continue;
      const st = await lstat(abs).catch(() => null);
      if (!st?.isFile() || st.size > 2_000_000) continue;
      const data = await readFile(abs);
      tarEntries.push({ name: file.path, data });
    }

    const manifest = Buffer.from(
      JSON.stringify({
        branch: status.branch,
        headSha: status.headSha,
        deletedPaths: status.files
          .filter((f) => f.stagedStatus === "D" || f.unstagedStatus === "D")
          .map((f) => f.path),
      }),
      "utf8",
    );
    tarEntries.push({ name: ".devcollab-snapshot-manifest.json", data: manifest });

    const archive = createSafeTarGzFromEntries(tarEntries);
    const safeWorkspaceId = this.validatePathKey(workspaceId);
    const safeSnapshotId = this.validatePathKey(snapshotId);
    const storageKey = `${safeWorkspaceId}/${safeSnapshotId}.tar.gz`;
    const dest = path.resolve(this.snapshotDir, storageKey);
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, archive);

    return {
      storageKey,
      sizeBytes: archive.byteLength,
      checksumSha256: sha256Buffer(archive),
      trackedFileCount: changedTracked.length,
      untrackedFileCount: untracked.length,
    };
  }

  async restoreRecoverySnapshot(input: {
    pathKey: string;
    storageKey: string;
    expectedChecksum: string;
  }): Promise<{ restoredFiles: number }> {
    const repoDir = await this.requireExistingRepoDir(input.pathKey);
    const resolvedSnapDir = path.resolve(this.snapshotDir);
    const archivePath = path.resolve(resolvedSnapDir, input.storageKey);
    if (!archivePath.startsWith(`${resolvedSnapDir}${path.sep}`)) {
      throw new WorkspaceFsError("Snapshot storage key escapes snapshot root.", 403, "SNAPSHOT_ESCAPE");
    }

    let archiveBuf: Buffer;
    try {
      archiveBuf = await readFile(archivePath);
    } catch {
      throw new WorkspaceFsError("Recovery snapshot file is missing from storage.", 404, "SNAPSHOT_MISSING");
    }

    if (sha256Buffer(archiveBuf) !== input.expectedChecksum) {
      throw new WorkspaceFsError("Recovery snapshot checksum verification failed.", 500, "SNAPSHOT_CORRUPT");
    }

    const extracted = await extractSafeTarGz(archiveBuf, repoDir, { stripTopLevel: false });
    const manifestPath = path.join(repoDir, ".devcollab-snapshot-manifest.json");
    try {
      const manifestRaw = await readFile(manifestPath, "utf8");
      const manifest = JSON.parse(manifestRaw) as { deletedPaths?: string[] };
      for (const delPath of manifest.deletedPaths ?? []) {
        const target = await this.resolveContainedPath(repoDir, delPath, { mustExist: false }).catch(
          () => null,
        );
        if (target) await rm(target, { force: true });
      }
      await rm(manifestPath, { force: true });
    } catch {
      await rm(manifestPath, { force: true }).catch(() => {});
    }

    return { restoredFiles: Math.max(0, extracted.fileCount - 1) };
  }
}
