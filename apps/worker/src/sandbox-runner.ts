import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { AgentTestRunStatus } from "@devcollab/shared";
import { scrubSecrets } from "@devcollab/ai-core";

const execFileAsync = promisify(execFile);

export interface SandboxExecutionResult {
  status: AgentTestRunStatus;
  command: string | null;
  exitCode: number | null;
  durationMs: number;
  stdoutExcerpt: string | null;
  stderrExcerpt: string | null;
  explanation: string;
  sandboxed: boolean;
}

export type ExecCommandFn = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number },
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

const DEFAULT_EXEC_COMMAND: ExecCommandFn = async (file, args, options) => {
  try {
    const { stdout, stderr } = await execFileAsync(file, args, {
      timeout: options.timeout,
      maxBuffer: options.maxBuffer,
      windowsHide: true,
    });
    return { stdout: String(stdout ?? ""), stderr: String(stderr ?? ""), exitCode: 0 };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; code?: number | string; killed?: boolean };
    const exitCode = typeof err.code === "number" ? err.code : 1;
    return {
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? (err.killed ? "Container execution timed out." : "")),
      exitCode,
    };
  }
};

const SAFE_SCRIPT_PATTERN =
  /^(node\s+--test|npx\s+(tsc|vitest|jest|eslint)|tsc|vitest|jest|eslint|npm\s+test|pnpm\s+test)\b/;
const FORBIDDEN_SHELL_CHARS = /[;&|`$<>\\]/;

function clipOutput(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const cleaned = scrubSecrets(raw.trim());
  return cleaned.length > 6000 ? `${cleaned.slice(0, 6000)}\n...[truncated]` : cleaned;
}

export async function selectAllowlistedCheckCommand(
  workDir: string,
  suggestedChecks: string[],
): Promise<string | null> {
  let pkgJson: { scripts?: Record<string, unknown> } | null;
  try {
    const raw = await readFile(path.join(workDir, "package.json"), "utf8");
    pkgJson = JSON.parse(raw) as { scripts?: Record<string, unknown> };
  } catch {
    pkgJson = null;
  }

  const scripts = pkgJson?.scripts ?? {};
  const candidates: string[] = [];

  for (const key of ["test", "typecheck", "lint"] as const) {
    const val = scripts[key];
    if (typeof val === "string" && val.trim() && !val.includes("no test specified")) {
      if (SAFE_SCRIPT_PATTERN.test(val.trim()) && !FORBIDDEN_SHELL_CHARS.test(val.trim())) {
        candidates.push(val.trim());
      } else if (/^npm run |^pnpm /.test(val.trim()) && !FORBIDDEN_SHELL_CHARS.test(val.trim())) {
        candidates.push(val.trim());
      }
    }
  }

  for (const check of suggestedChecks) {
    const trimmed = check.trim();
    if (SAFE_SCRIPT_PATTERN.test(trimmed) && !FORBIDDEN_SHELL_CHARS.test(trimmed)) {
      candidates.push(trimmed);
    }
  }

  return candidates[0] ?? null;
}

export class SandboxRunner {
  private execCommand: ExecCommandFn = DEFAULT_EXEC_COMMAND;

  constructor(
    private readonly options: {
      sandboxEnabled: boolean;
      dockerImage: string;
      timeoutMs: number;
    },
  ) {}

  setExecutorForTesting(executor: ExecCommandFn) {
    this.execCommand = executor;
  }

  buildHardenedDockerArgs(workDir: string, selectedCommand: string): string[] {
    return [
      "run",
      "--rm",
      "--network=none",
      "--read-only",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--pids-limit=128",
      "--memory=512m",
      "--cpus=1",
      "--user=1000:1000",
      "-e",
      "NODE_ENV=test",
      "-e",
      "HOME=/tmp",
      "-v",
      `${path.resolve(workDir)}:/workspace:rw`,
      "-w",
      "/workspace",
      this.options.dockerImage,
      "sh",
      "-lc",
      selectedCommand,
    ];
  }

  async runChecks(workDir: string, suggestedChecks: string[]): Promise<SandboxExecutionResult> {
    const selectedCommand = await selectAllowlistedCheckCommand(workDir, suggestedChecks);
    if (!selectedCommand) {
      return {
        status: "SKIPPED",
        command: null,
        exitCode: null,
        durationMs: 0,
        stdoutExcerpt: null,
        stderrExcerpt: null,
        sandboxed: false,
        explanation:
          "No allowlisted test or check script was found in package.json or suggested checks.",
      };
    }

    if (!this.options.sandboxEnabled) {
      return {
        status: "UNAVAILABLE",
        command: selectedCommand,
        exitCode: null,
        durationMs: 0,
        stdoutExcerpt: null,
        stderrExcerpt: null,
        sandboxed: false,
        explanation:
          "Sandbox execution is disabled (SANDBOX_ENABLED=false); untrusted code never executes on the host.",
      };
    }

    const probe = await this.execCommand(
      "docker",
      ["info", "--format", "{{.ServerVersion}}"],
      { timeout: 2500, maxBuffer: 64 * 1024 },
    );

    if (probe.exitCode !== 0) {
      return {
        status: "UNAVAILABLE",
        command: selectedCommand,
        exitCode: null,
        durationMs: 0,
        stdoutExcerpt: null,
        stderrExcerpt: null,
        sandboxed: false,
        explanation:
          "Docker sandbox runtime is unavailable on this host; untrusted code was NOT executed on the host.",
      };
    }

    const startMs = Date.now();
    const dockerArgs = this.buildHardenedDockerArgs(workDir, selectedCommand);
    const result = await this.execCommand("docker", dockerArgs, {
      timeout: this.options.timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    const durationMs = Math.max(1, Date.now() - startMs);

    return {
      status: result.exitCode === 0 ? "PASSED" : "FAILED",
      command: selectedCommand,
      exitCode: result.exitCode,
      durationMs,
      stdoutExcerpt: clipOutput(result.stdout),
      stderrExcerpt: clipOutput(result.stderr),
      sandboxed: true,
      explanation:
        result.exitCode === 0
          ? `Check passed inside hardened ephemeral Docker container (${this.options.dockerImage}, network disabled).`
          : `Check failed (exit ${result.exitCode}) inside hardened ephemeral Docker container (${this.options.dockerImage}).`,
    };
  }
}
