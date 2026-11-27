import { createPrivateKey, type KeyObject } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { GitHubAppConfigStatusDto } from "@devcollab/shared";
import { normalizePrivateKeyPem, type AppConfiguration } from "../config/environment";

export interface GitHubAppCredentials {
  appId: string;
  appSlug: string;
  privateKey: KeyObject;
  apiBaseUrl: string;
}

@Injectable()
export class GitHubConfigService {
  constructor(private readonly config?: ConfigService<AppConfiguration, true>) {}

  private readRaw() {
    const cfg = this.config?.get("github", { infer: true });
    return {
      appId: cfg?.appId ?? process.env.GITHUB_APP_ID?.trim() ?? undefined,
      appSlug: cfg?.appSlug ?? process.env.GITHUB_APP_SLUG?.trim() ?? undefined,
      privateKeyPem:
        cfg?.privateKey ?? normalizePrivateKeyPem(process.env.GITHUB_APP_PRIVATE_KEY),
      webhookSecret:
        cfg?.webhookSecret ?? (process.env.GITHUB_WEBHOOK_SECRET?.trim() || undefined),
      apiBaseUrl:
        cfg?.apiBaseUrl ??
        (process.env.GITHUB_API_BASE_URL?.trim().replace(/\/$/, "") || "https://api.github.com"),
    };
  }

  private parsePrivateKey(pem: string | undefined): KeyObject | null {
    if (!pem) return null;
    try {
      return createPrivateKey(pem);
    } catch {
      return null;
    }
  }

  getStatus(): GitHubAppConfigStatusDto {
    const raw = this.readRaw();
    const missingFields: string[] = [];
    if (!raw.appId || !/^\d+$/.test(raw.appId)) missingFields.push("GITHUB_APP_ID");
    if (!raw.appSlug) missingFields.push("GITHUB_APP_SLUG");
    if (!raw.privateKeyPem) {
      missingFields.push("GITHUB_APP_PRIVATE_KEY");
    } else if (!this.parsePrivateKey(raw.privateKeyPem)) {
      missingFields.push("GITHUB_APP_PRIVATE_KEY (invalid PEM format)");
    }

    return {
      configured: missingFields.length === 0,
      appSlug: raw.appSlug ?? null,
      missingFields,
    };
  }

  requireAppCredentials(): GitHubAppCredentials {
    const raw = this.readRaw();
    const status = this.getStatus();
    if (!status.configured || !raw.appId || !raw.appSlug) {
      throw new ServiceUnavailableException(
        `GitHub App is not configured on this server (missing: ${status.missingFields.join(", ")}).`,
      );
    }
    const privateKey = this.parsePrivateKey(raw.privateKeyPem);
    if (!privateKey) {
      throw new ServiceUnavailableException("GITHUB_APP_PRIVATE_KEY could not be parsed.");
    }
    return {
      appId: raw.appId,
      appSlug: raw.appSlug,
      privateKey,
      apiBaseUrl: raw.apiBaseUrl,
    };
  }

  getWebhookSecret(): string | null {
    return this.readRaw().webhookSecret ?? null;
  }

  getApiBaseUrl(): string {
    return this.readRaw().apiBaseUrl;
  }
}
