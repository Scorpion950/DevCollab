import { sign, type KeyObject } from "node:crypto";
import { scrubSecrets } from "./secrets.js";

export interface GitHubBranchPayload {
  name: string;
  commit: {
    sha: string;
  };
}

export interface GitHubTreeItemPayload {
  path: string;
  mode: string;
  type: "blob" | "tree" | string;
  sha: string;
  size?: number;
}

export interface GitHubTreePayload {
  sha: string;
  truncated?: boolean;
  tree: GitHubTreeItemPayload[];
}

export interface GitHubFileContentPayload {
  type: string;
  encoding?: string;
  size: number;
  name: string;
  path: string;
  sha: string;
  content?: string;
}

export interface GitHubJsonTransport {
  request<T>(
    url: string,
    init: { method?: string; headers: Record<string, string>; body?: string },
  ): Promise<{ status: number; headers: { get(name: string): string | null }; json: T | null }>;
}

export interface GitHubBinaryTransport {
  download(
    url: string,
    headers: Record<string, string>,
    allowedRedirectOrigins: string[],
    maxBytes: number,
  ): Promise<Buffer>;
}

export class GitHubSourceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimited = false,
    public readonly revokedOrNotFound = false,
  ) {
    super(message);
    this.name = "GitHubSourceApiError";
  }
}

function toBase64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function createGitHubAppJwt(appId: string, privateKey: string | KeyObject): string {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign("RSA-SHA256", Buffer.from(signingInput), privateKey);
  return `${signingInput}.${toBase64Url(signature)}`;
}

export function decodeGitHubFileContent(
  payload: GitHubFileContentPayload,
  fallbackPath: string,
): { path: string; size: number; encoding: string; contentText: string | null; isBinary: boolean } {
  if (payload.type !== "file" || typeof payload.content !== "string") {
    return {
      path: fallbackPath,
      size: payload.size ?? 0,
      encoding: payload.encoding ?? "unknown",
      contentText: null,
      isBinary: true,
    };
  }
  const rawBuffer = Buffer.from(payload.content.replace(/\s+/g, ""), "base64");
  const isBinary = rawBuffer.includes(0);
  return {
    path: payload.path ?? fallbackPath,
    size: payload.size ?? rawBuffer.byteLength,
    encoding: payload.encoding ?? "base64",
    contentText: isBinary ? null : rawBuffer.toString("utf8"),
    isBinary,
  };
}

export async function readLimitedResponseBuffer(res: Response, maxBytes: number): Promise<Buffer> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new GitHubSourceApiError("Repository archive exceeds size limit.", 413);
  }
  const reader = res.body?.getReader();
  if (!reader) {
    const ab = await res.arrayBuffer();
    if (ab.byteLength > maxBytes) {
      throw new GitHubSourceApiError("Repository archive exceeds size limit.", 413);
    }
    return Buffer.from(ab);
  }
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new GitHubSourceApiError("Repository archive exceeds size limit.", 413);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks, total);
}

export const DEFAULT_GITHUB_JSON_TRANSPORT: GitHubJsonTransport = {
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

export const DEFAULT_GITHUB_BINARY_TRANSPORT: GitHubBinaryTransport = {
  async download(
    url: string,
    headers: Record<string, string>,
    allowedRedirectOrigins: string[],
    maxBytes: number,
  ): Promise<Buffer> {
    let currentUrl = url;
    let sendAuth = true;
    for (let hop = 0; hop < 3; hop += 1) {
      const requestHeaders: Record<string, string> = sendAuth
        ? headers
        : { "User-Agent": headers["User-Agent"] ?? "DevCollab-GitHubApp" };
      const res = await fetch(currentUrl, {
        method: "GET",
        headers: requestHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(25_000),
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) {
          throw new GitHubSourceApiError("Invalid redirect when fetching repository archive.", 502);
        }
        const target = new URL(loc, currentUrl);
        if (!allowedRedirectOrigins.includes(target.origin)) {
          throw new GitHubSourceApiError(
            "Rejected unexpected redirect origin for repository archive.",
            502,
          );
        }
        currentUrl = target.toString();
        sendAuth = false;
        continue;
      }
      if (res.status >= 200 && res.status < 300) {
        return readLimitedResponseBuffer(res, maxBytes);
      }
      const remaining = res.headers.get("x-ratelimit-remaining");
      const rateLimited = res.status === 429 || (res.status === 403 && remaining === "0");
      throw new GitHubSourceApiError(
        `GitHub tarball download failed (${res.status}).`,
        res.status,
        rateLimited,
        res.status === 404 || res.status === 401,
      );
    }
    throw new GitHubSourceApiError("Too many redirects while downloading repository archive.", 502);
  },
};

export class GitHubSourceClient {
  private readonly tokenCache = new Map<string, { token: string; expiresAtMs: number }>();
  private jsonTransport: GitHubJsonTransport = DEFAULT_GITHUB_JSON_TRANSPORT;
  private binaryTransport: GitHubBinaryTransport = DEFAULT_GITHUB_BINARY_TRANSPORT;
  private readonly apiBaseUrl: string;

  constructor(
    private readonly creds: {
      appId: string;
      privateKey: string;
      apiBaseUrl?: string;
    },
  ) {
    this.apiBaseUrl = (creds.apiBaseUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  setTransportsForTesting(
    jsonTransport: GitHubJsonTransport,
    binaryTransport?: GitHubBinaryTransport,
  ) {
    this.jsonTransport = jsonTransport;
    if (binaryTransport) {
      this.binaryTransport = binaryTransport;
    }
  }

  private async requestGitHub<T>(
    path: string,
    token: string,
    method: "GET" | "POST" = "GET",
  ): Promise<T> {
    const url = `${this.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await this.jsonTransport.request<T & { message?: string }>(url, {
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
    const rateLimited = response.status === 429 || (response.status === 403 && remaining === "0");
    const revokedOrNotFound = response.status === 404 || response.status === 401;
    const message = scrubSecrets(
      response.json?.message ?? `GitHub API returned status ${response.status}`,
      [token],
    );
    throw new GitHubSourceApiError(message, response.status, rateLimited, revokedOrNotFound);
  }

  async getInstallationToken(githubInstallationId: string): Promise<string> {
    const cached = this.tokenCache.get(githubInstallationId);
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return cached.token;
    }
    const jwt = createGitHubAppJwt(this.creds.appId, this.creds.privateKey);
    const payload = await this.requestGitHub<{ token: string; expires_at?: string }>(
      `/app/installations/${encodeURIComponent(githubInstallationId)}/access_tokens`,
      jwt,
      "POST",
    );
    const expiresAtMs = payload.expires_at ? Date.parse(payload.expires_at) : Date.now() + 50 * 60_000;
    this.tokenCache.set(githubInstallationId, { token: payload.token, expiresAtMs });
    return payload.token;
  }

  private async requestAsInstallation<T>(githubInstallationId: string, path: string): Promise<T> {
    const token = await this.getInstallationToken(githubInstallationId);
    try {
      return await this.requestGitHub<T>(path, token, "GET");
    } catch (error) {
      if (
        error instanceof GitHubSourceApiError &&
        (error.status === 401 || error.revokedOrNotFound)
      ) {
        this.tokenCache.delete(githubInstallationId);
      }
      throw error;
    }
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
  ) {
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
    const url = `${this.apiBaseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/tarball/${encodeURIComponent(ref)}`;
    const allowedOrigins = Array.from(
      new Set([new URL(this.apiBaseUrl).origin, "https://codeload.github.com"]),
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
      if (
        error instanceof GitHubSourceApiError &&
        (error.status === 401 || error.revokedOrNotFound)
      ) {
        this.tokenCache.delete(githubInstallationId);
      }
      throw error;
    }
  }
}
