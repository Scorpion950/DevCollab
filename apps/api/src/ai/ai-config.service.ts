import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AiProviderClient } from "@devcollab/ai-core";
import { validateEnvironment, type AiConfiguration } from "../config/environment";

const execFileAsync = promisify(execFile);

export type SandboxAvailabilityChecker = () => Promise<{ available: boolean; reason: string }>;

@Injectable()
export class AiConfigService {
  private sandboxCache: { expiresAt: number; available: boolean; reason: string } | null = null;
  private sandboxCheckerOverride: SandboxAvailabilityChecker | null = null;

  constructor(@Optional() @Inject(ConfigService) private readonly config?: ConfigService) {}

  setSandboxCheckerForTesting(checker: SandboxAvailabilityChecker | null) {
    this.sandboxCheckerOverride = checker;
    this.sandboxCache = null;
  }

  getConfiguration(): AiConfiguration {
    const configured = this.config?.get<AiConfiguration>("ai");
    if (configured) return configured;
    return validateEnvironment(process.env).ai;
  }

  isConfigured(): boolean {
    const ai = this.getConfiguration();
    return Boolean(ai.provider && ai.model && ai.apiKey);
  }

  createProviderClient(): AiProviderClient {
    const ai = this.getConfiguration();
    if (!ai.provider || !ai.model || !ai.apiKey) {
      throw new ServiceUnavailableException(
        "AI provider is not configured on this server (set AI_PROVIDER, AI_MODEL, and AI_API_KEY).",
      );
    }
    return new AiProviderClient({
      provider: ai.provider,
      model: ai.model,
      apiKey: ai.apiKey,
      apiBaseUrl: ai.apiBaseUrl,
      timeoutMs: ai.timeoutMs,
      priceInputPer1m: ai.priceInputPer1m,
      priceOutputPer1m: ai.priceOutputPer1m,
    });
  }

  async checkSandboxAvailability(): Promise<{
    enabled: boolean;
    available: boolean;
    reason: string;
  }> {
    const ai = this.getConfiguration();
    if (!ai.sandboxEnabled) {
      return {
        enabled: false,
        available: false,
        reason: "Sandboxed execution is disabled (SANDBOX_ENABLED=false); host execution is never used.",
      };
    }

    if (this.sandboxCheckerOverride) {
      const checked = await this.sandboxCheckerOverride();
      return {
        enabled: true,
        available: checked.available,
        reason: checked.reason,
      };
    }

    const now = Date.now();
    if (this.sandboxCache && this.sandboxCache.expiresAt > now) {
      return {
        enabled: true,
        available: this.sandboxCache.available,
        reason: this.sandboxCache.reason,
      };
    }

    try {
      const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"], {
        timeout: 2500,
        windowsHide: true,
      });
      const version = stdout.trim();
      const result = {
        available: true,
        reason: `Docker sandbox runtime ready (engine ${version || "detected"}; image ${ai.sandboxDockerImage}).`,
      };
      this.sandboxCache = { ...result, expiresAt: now + 15_000 };
      return { enabled: true, ...result };
    } catch {
      const result = {
        available: false,
        reason:
          "Docker sandbox runtime is unavailable on this host; test execution stays disabled (tests unavailable, never executed on host).",
      };
      this.sandboxCache = { ...result, expiresAt: now + 15_000 };
      return { enabled: true, ...result };
    }
  }
}
