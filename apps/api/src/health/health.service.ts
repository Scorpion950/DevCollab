import type { HealthResponse } from "@devcollab/shared";
import { Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { AiConfigService } from "../ai/ai-config.service";
import { DatabaseService } from "../database/database.service";
import { GitHubConfigService } from "../github/github-config.service";
import { WorkerClientService } from "../workspaces/worker-client.service";

export interface ReadinessResponse {
  status: "ready";
  service: "devcollab-api";
  database: "ok";
  timestamp: string;
}

export interface ServiceDiagnosticsResponse {
  status: "ready" | "degraded";
  service: "devcollab-api";
  database: boolean;
  githubAppConfigured: boolean;
  aiConfigured: boolean;
  sandboxEnabled: boolean;
  terminalEnabled: boolean;
  workerReachable: boolean;
  collabAvailable: boolean;
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Optional() private readonly db?: DatabaseService,
    @Optional() private readonly githubConfig?: GitHubConfigService,
    @Optional() private readonly aiConfig?: AiConfigService,
    @Optional() private readonly worker?: WorkerClientService,
  ) {}

  getStatus(): HealthResponse {
    return { status: "ok", service: "devcollab-api" };
  }

  private async checkDatabase(): Promise<boolean> {
    if (!this.db || !process.env.DATABASE_URL?.trim()) return false;
    try {
      await Promise.race([
        this.db.prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4_000)),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async getReadiness(): Promise<ReadinessResponse> {
    const dbOk = await this.checkDatabase();
    if (!dbOk) {
      throw new ServiceUnavailableException({
        status: "degraded",
        service: "devcollab-api",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      });
    }
    return {
      status: "ready",
      service: "devcollab-api",
      database: "ok",
      timestamp: new Date().toISOString(),
    };
  }

  async getDiagnostics(): Promise<ServiceDiagnosticsResponse> {
    const [database, workerCaps] = await Promise.all([
      this.checkDatabase(),
      this.worker
        ? this.worker.getRuntimeCapabilities().catch(() => null)
        : Promise.resolve(null),
    ]);
    const aiCfg = this.aiConfig?.getConfiguration();
    return {
      status: database ? "ready" : "degraded",
      service: "devcollab-api",
      database,
      githubAppConfigured: Boolean(this.githubConfig?.getStatus().configured),
      aiConfigured: Boolean(this.aiConfig?.isConfigured()),
      sandboxEnabled: Boolean(aiCfg?.sandboxEnabled),
      terminalEnabled: Boolean(workerCaps?.terminalAvailable),
      workerReachable: Boolean(workerCaps?.workerReachable),
      collabAvailable: Boolean(workerCaps?.workerReachable),
      timestamp: new Date().toISOString(),
    };
  }
}
