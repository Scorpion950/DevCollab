import { Injectable } from "@nestjs/common";
import {
  createGitHubAppJwt,
  decodeGitHubFileContent,
  DEFAULT_GITHUB_BINARY_TRANSPORT,
  GitHubSourceApiError,
  type GitHubBinaryTransport,
  type GitHubBranchPayload,
  type GitHubFileContentPayload,
  type GitHubTreePayload,
} from "@devcollab/ai-core";
import { GitHubConfigService } from "./github-config.service";

export type { GitHubBinaryTransport, GitHubBranchPayload, GitHubFileContentPayload, GitHubTreePayload };

export interface GitHubInstallationPayload {
  id: number;
  account: {
    login: string;
    type: string;
    avatar_url?: string | null;
  } | null;
  suspended_at?: string | null;
  permissions?: Record<string, string>;
}

export interface GitHubRepoPayload {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  default_branch: string;
  open_issues_count?: number;
  owner: { login: string };
}

export interface GitHubPullRequestPayload {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  draft?: boolean;
  html_url: string;
  user: { login: string; avatar_url?: string | null } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  mergeable_state?: string | null;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
}

export interface GitHubReviewPayload {
  id: number;
  user: { login: string; avatar_url?: string | null } | null;
  state: string;
  submitted_at?: string | null;
}

export interface GitHubPullRequestFilePayload {
  sha: string | null;
  filename: string;
  previous_filename?: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  blob_url?: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimited = false,
    public readonly revokedOrNotFound = false,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export interface GitHubTransport {
  request<T>(
    url: string,
    init: { method?: string; headers: Record<string, string>; body?: string },
  ): Promise<{ status: number; headers: { get(name: string): string | null }; json: T | null }>;
}

const DEFAULT_TRANSPORT: GitHubTransport = {
  async request<T>(
    url: string,
    init: { method?: string; headers: Record<string, string>; body?: string },
  ) {
    const res = await fetch(url, {
      method: init.method ?? "GET",
      headers: init.headers,
      body: init.body,
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    let json: T | null = null;
    if (text) {
      try {
        json = JSON.parse(text) as T;
      } catch {
        json = null;
      }
    }
    return {
      status: res.status,
      headers: {
        get: (name: string) => res.headers.get(name),
      },
      json,
    };
  },
};

@Injectable()
export class GitHubAppClientService {
  private readonly tokenCache = new Map<string, { token: string; expiresAtMs: number }>();
  private transport: GitHubTransport = DEFAULT_TRANSPORT;
  private binaryTransport: GitHubBinaryTransport = DEFAULT_GITHUB_BINARY_TRANSPORT;

  constructor(private readonly config: GitHubConfigService) {}

  setTransportForTesting(transport: GitHubTransport, binaryTransport?: GitHubBinaryTransport) {
    this.transport = transport;
    if (binaryTransport) {
      this.binaryTransport = binaryTransport;
    }
  }

  clearTokenCache() {
    this.tokenCache.clear();
  }

  invalidateInstallationToken(githubInstallationId: string) {
    this.tokenCache.delete(githubInstallationId);
  }

  createAppJwt(): string {
    const creds = this.config.requireAppCredentials();
    return createGitHubAppJwt(creds.appId, creds.privateKey);
  }

  private async requestGitHub<T>(
    path: string,
    token: string,
    method: "GET" | "POST" = "GET",
  ): Promise<T> {
    const base = this.config.getApiBaseUrl();
    const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.transport.request<T & { message?: string }>(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "DevCollab-GitHubApp",
      },
    });

    if (response.status >= 200 && response.status < 300) {
      return (response.json ?? ({} as T)) as T;
    }

    const remaining = response.headers.get("x-ratelimit-remaining");
    const isRateLimited =
      response.status === 429 || (response.status === 403 && remaining === "0");
    const msgFromApi =
      response.json && typeof response.json === "object" && typeof response.json.message === "string"
        ? response.json.message
        : null;

    if (isRateLimited) {
      throw new GitHubApiError(
        msgFromApi || "GitHub API rate limit reached. Please retry after reset.",
        429,
        true,
        false,
      );
    }

    if (
      response.status === 401 ||
      response.status === 403 ||
      response.status === 404 ||
      response.status === 410
    ) {
      throw new GitHubApiError(
        msgFromApi || "GitHub installation or repository access is unavailable or revoked.",
        response.status,
        false,
        true,
      );
    }

    throw new GitHubApiError(
      msgFromApi || `GitHub API returned status ${response.status}.`,
      response.status >= 400 ? response.status : 502,
      false,
      false,
    );
  }

  async getInstallationToken(githubInstallationId: string): Promise<string> {
    const now = Date.now();
    const cached = this.tokenCache.get(githubInstallationId);
    if (cached && cached.expiresAtMs - 90_000 > now) {
      return cached.token;
    }

    if (this.tokenCache.size > 500) {
      for (const [k, v] of this.tokenCache.entries()) {
        if (v.expiresAtMs <= now) this.tokenCache.delete(k);
      }
      if (this.tokenCache.size > 500) this.tokenCache.clear();
    }

    const jwt = this.createAppJwt();
    const res = await this.requestGitHub<{ token: string; expires_at: string }>(
      `/app/installations/${encodeURIComponent(githubInstallationId)}/access_tokens`,
      jwt,
      "POST",
    );
    const expiresAtMs = Number.isNaN(Date.parse(res.expires_at))
      ? now + 45 * 60_000
      : Date.parse(res.expires_at);

    this.tokenCache.set(githubInstallationId, { token: res.token, expiresAtMs });
    return res.token;
  }

  private async requestAsInstallation<T>(githubInstallationId: string, path: string): Promise<T> {
    const token = await this.getInstallationToken(githubInstallationId);
    try {
      return await this.requestGitHub<T>(path, token, "GET");
    } catch (error) {
      if (error instanceof GitHubApiError && (error.status === 401 || error.revokedOrNotFound)) {
        this.invalidateInstallationToken(githubInstallationId);
      }
      throw error;
    }
  }

  async getInstallation(githubInstallationId: string): Promise<GitHubInstallationPayload> {
    const jwt = this.createAppJwt();
    return this.requestGitHub<GitHubInstallationPayload>(
      `/app/installations/${encodeURIComponent(githubInstallationId)}`,
      jwt,
      "GET",
    );
  }

  async listInstallationRepositories(
    githubInstallationId: string,
    page = 1,
    perPage = 100,
  ): Promise<{ total_count: number; repositories: GitHubRepoPayload[] }> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/installation/repositories?per_page=${perPage}&page=${page}`,
    );
  }

  async getRepository(
    githubInstallationId: string,
    owner: string,
    repo: string,
  ): Promise<GitHubRepoPayload> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
  }

  async listPullRequests(
    githubInstallationId: string,
    owner: string,
    repo: string,
    page = 1,
    perPage = 30,
  ): Promise<GitHubPullRequestPayload[]> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls?state=all&sort=updated&direction=desc&per_page=${perPage}&page=${page}`,
    );
  }

  async getPullRequest(
    githubInstallationId: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPullRequestPayload> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`,
    );
  }

  async listPullRequestReviews(
    githubInstallationId: string,
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubReviewPayload[]> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews?per_page=100`,
    );
  }

  async listPullRequestFiles(
    githubInstallationId: string,
    owner: string,
    repo: string,
    prNumber: number,
    page = 1,
    perPage = 100,
  ): Promise<GitHubPullRequestFilePayload[]> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
    );
  }

  async getBranch(
    githubInstallationId: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubBranchPayload> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}`,
    );
  }

  async getTree(
    githubInstallationId: string,
    owner: string,
    repo: string,
    treeSha: string,
    recursive = true,
  ): Promise<GitHubTreePayload> {
    return this.requestAsInstallation(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(treeSha)}${recursive ? "?recursive=1" : ""}`,
    );
  }

  async getFileContent(
    githubInstallationId: string,
    owner: string,
    repo: string,
    filePath: string,
    ref: string,
  ): Promise<{ path: string; size: number; encoding: string; contentText: string | null; isBinary: boolean }> {
    const encodedPath = filePath
      .split("/")
      .filter(Boolean)
      .map((part) => encodeURIComponent(part))
      .join("/");
    const payload = await this.requestAsInstallation<GitHubFileContentPayload>(
      githubInstallationId,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`,
    );
    return decodeGitHubFileContent(payload, filePath);
  }

  async downloadRepositoryTarball(
    githubInstallationId: string,
    owner: string,
    repo: string,
    ref: string,
    maxBytes = 25 * 1024 * 1024,
  ): Promise<Buffer> {
    const token = await this.getInstallationToken(githubInstallationId);
    const base = this.config.getApiBaseUrl();
    const url = `${base}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`;
    const allowedOrigins = Array.from(
      new Set([new URL(base).origin, "https://codeload.github.com"]),
    );
    try {
      return await this.binaryTransport.download(
        url,
        {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "DevCollab-GitHubApp",
        },
        allowedOrigins,
        maxBytes,
      );
    } catch (error) {
      if (error instanceof GitHubSourceApiError) {
        if (error.status === 401 || error.revokedOrNotFound) {
          this.invalidateInstallationToken(githubInstallationId);
        }
        throw new GitHubApiError(
          error.message,
          error.status,
          error.rateLimited,
          error.revokedOrNotFound,
        );
      }
      if (error instanceof GitHubApiError && (error.status === 401 || error.revokedOrNotFound)) {
        this.invalidateInstallationToken(githubInstallationId);
      }
      throw error;
    }
  }
}
