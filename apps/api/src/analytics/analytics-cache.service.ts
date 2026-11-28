import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";

interface CacheEntry {
  key: string;
  organizationId: string;
  projectId: string | null;
  userId: string | null;
  expiresAt: number;
  payload: unknown;
}

const DEFAULT_TTL_MS = 20_000;
const MAX_ENTRIES = 250;

@Injectable()
export class AnalyticsCacheService {
  private readonly store = new Map<string, CacheEntry>();

  buildKey(parts: {
    scope: string;
    organizationId: string;
    projectId?: string | null;
    userId?: string | null;
    queryParts: Record<string, string | number | undefined | null>;
  }): string {
    const normalized = JSON.stringify({
      scope: parts.scope,
      organizationId: parts.organizationId,
      projectId: parts.projectId ?? null,
      userId: parts.userId ?? null,
      queryParts: parts.queryParts,
    });
    return createHash("sha256").update(normalized, "utf8").digest("hex");
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.payload as T;
  }

  set<T>(meta: {
    key: string;
    organizationId: string;
    projectId?: string | null;
    userId?: string | null;
    payload: T;
    ttlMs?: number;
  }): void {
    const now = Date.now();
    if (this.store.size >= MAX_ENTRIES) {
      for (const [k, existing] of this.store.entries()) {
        if (existing.expiresAt <= now) {
          this.store.delete(k);
        }
      }
      if (this.store.size >= MAX_ENTRIES) {
        const oldestKey = this.store.keys().next().value;
        if (oldestKey) this.store.delete(oldestKey);
      }
    }

    this.store.set(meta.key, {
      key: meta.key,
      organizationId: meta.organizationId,
      projectId: meta.projectId ?? null,
      userId: meta.userId ?? null,
      expiresAt: now + (meta.ttlMs ?? DEFAULT_TTL_MS),
      payload: meta.payload,
    });
  }

  invalidateOrganization(organizationId: string): void {
    for (const [k, entry] of this.store.entries()) {
      if (entry.organizationId === organizationId) {
        this.store.delete(k);
      }
    }
  }

  invalidateProject(organizationId: string, projectId: string): void {
    for (const [k, entry] of this.store.entries()) {
      if (
        entry.organizationId === organizationId &&
        (entry.projectId === null || entry.projectId === projectId)
      ) {
        this.store.delete(k);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }
}
