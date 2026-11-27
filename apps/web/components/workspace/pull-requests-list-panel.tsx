"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  MessageSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import type { ProjectDetailDto, PullRequestsListResponseDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import {
  GitHubReviewStateBadge,
  PullRequestStateBadge,
  RepoConnectionBadge,
} from "./github-badges";
import { ProjectSubnav } from "./project-subnav";
import { formatDateTime } from "./task-badges";

type PrFilterTab = "OPEN" | "DRAFT" | "MERGED" | "CLOSED" | "ALL";

export function PullRequestsListPanel({
  project,
  initialData,
}: {
  project: ProjectDetailDto;
  initialData: PullRequestsListResponseDto;
}) {
  const [data, setData] = useState<PullRequestsListResponseDto>(initialData);
  const [stateFilter, setStateFilter] = useState<PrFilterTab>("OPEN");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sort, setSort] = useState<"updated" | "newest" | "oldest">("updated");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      setPage(1);
    }, 240);
    return () => clearTimeout(id);
  }, [searchInput]);

  const fetchPullRequests = useCallback(
    async (opts?: { nextState?: PrFilterTab; nextPage?: number; nextSort?: "updated" | "newest" | "oldest" }) => {
      const targetState = opts?.nextState ?? stateFilter;
      const targetPage = opts?.nextPage ?? page;
      const targetSort = opts?.nextSort ?? sort;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          state: targetState,
          sort: targetSort,
          page: String(targetPage),
          limit: "20",
        });
        if (debouncedSearch) params.set("search", debouncedSearch);

        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(project.id)}/github/pull-requests?${params.toString()}`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.message || "Failed to load pull requests.");
          return;
        }
        setData(json as PullRequestsListResponseDto);
      } catch {
        setError("Network error while loading pull requests.");
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, page, project.id, sort, stateFilter],
  );

  useEffect(() => {
    void fetchPullRequests();
  }, [fetchPullRequests]);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/github/sync`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "GitHub synchronization failed.");
      }
      await fetchPullRequests();
    } catch {
      setError("Network error synchronizing pull requests.");
    } finally {
      setSyncing(false);
    }
  }

  const repo = data.repository;
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span>{repo ? repo.fullName : "Pull Requests"}</span>
            {repo && <RepoConnectionBadge status={repo.status} />}
          </p>
          <h1>Pull Requests</h1>
          <p className="page-subtitle">
            {repo
              ? "Review synced GitHub pull requests, inspect diffs, add DevCollab review discussions, and link tasks."
              : "Connect a GitHub repository to synchronize and review pull requests."}
          </p>
          <ProjectSubnav
            projectId={project.id}
            active="pull-requests"
            canManageProject={project.canManageProject}
          />
        </div>

        <div className="page-actions">
          {repo && (
            <>
              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={syncing || !data.githubApp.configured}
                onClick={handleSync}
              >
                <RefreshCw size={14} className={syncing ? "spin-icon" : ""} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button asChild variant="secondary" size="compact">
                <a href={`${repo.htmlUrl}/pulls`} target="_blank" rel="noopener noreferrer">
                  Open on GitHub <ExternalLink size={14} />
                </a>
              </Button>
            </>
          )}
        </div>
      </header>

      {error && (
        <p className="banner banner-error" role="alert">
          <AlertTriangle size={16} /> {error}
        </p>
      )}

      {!repo ? (
        <section className="empty-panel">
          <FolderGit2 size={26} />
          <h2>No repository connected</h2>
          <p>Connect a repository on the Repository tab to inspect pull requests here.</p>
          <Button asChild size="compact">
            <Link href={`/app/projects/${project.id}/repository`}>Go to Repository setup</Link>
          </Button>
        </section>
      ) : (
        <>
          {repo.status !== "CONNECTED" && (
            <p className="banner banner-error" role="alert">
              <AlertTriangle size={16} />{" "}
              {repo.lastSyncError ||
                "GitHub App permission is currently unavailable. Pull requests shown are last synced snapshots."}
            </p>
          )}

          <div className="task-toolbar" role="region" aria-label="Pull request filters">
            <div className="inline-actions" role="tablist" aria-label="Pull request status filter">
              {(
                [
                  ["OPEN", `Open (${data.counts.open})`],
                  ["DRAFT", `Draft (${data.counts.draft})`],
                  ["MERGED", `Merged (${data.counts.merged})`],
                  ["CLOSED", `Closed (${data.counts.closed})`],
                  ["ALL", `All (${data.counts.all})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={stateFilter === key}
                  className="project-subnav-link"
                  aria-current={stateFilter === key ? "page" : undefined}
                  onClick={() => {
                    setStateFilter(key);
                    setPage(1);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="task-search-wrap">
              <Search size={15} className="task-search-icon" />
              <input
                type="search"
                className="field-input task-search-input"
                placeholder="Search title, #number, branch, or author…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>

            <select
              className="field-select toolbar-select"
              aria-label="Sort pull requests"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as "updated" | "newest" | "oldest");
                setPage(1);
              }}
            >
              <option value="updated">Recently updated</option>
              <option value="newest">Newest created</option>
              <option value="oldest">Oldest created</option>
            </select>
          </div>

          {loading ? (
            <section className="app-card">
              <p className="field-hint">Loading pull requests…</p>
            </section>
          ) : data.items.length === 0 ? (
            <section className="empty-panel">
              <GitPullRequest size={26} />
              <h2>
                {data.counts.all === 0
                  ? "No pull requests in this repository"
                  : "No matching pull requests"}
              </h2>
              <p>
                {data.counts.all === 0
                  ? "This repository currently has no synced pull requests. Click Sync now if new PRs were opened on GitHub."
                  : "Try clearing the search query or switching status tabs."}
              </p>
            </section>
          ) : (
            <section className="app-card" style={{ padding: 0, overflow: "hidden" }}>
              <div className="data-table-wrap task-table-desktop">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Pull request</th>
                      <th>Branches</th>
                      <th>Author</th>
                      <th>GitHub state</th>
                      <th>DevCollab</th>
                      <th>Updated</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((pr) => (
                      <tr key={pr.id}>
                        <td>
                          <Link
                            href={`/app/projects/${project.id}/pull-requests/${pr.number}`}
                            className="task-link-row"
                          >
                            <span className="project-key">#{pr.number}</span>
                            <strong>{pr.title}</strong>
                          </Link>
                        </td>
                        <td>
                          <span className="comment-meta">
                            <GitBranch size={11} style={{ display: "inline", marginRight: 4 }} />
                            {pr.headRef} → {pr.baseRef}
                          </span>
                        </td>
                        <td>{pr.authorLogin}</td>
                        <td>
                          <div className="inline-actions" style={{ gap: ".35rem" }}>
                            <PullRequestStateBadge state={pr.state} isDraft={pr.isDraft} />
                            {pr.githubReviewDecision && (
                              <GitHubReviewStateBadge decision={pr.githubReviewDecision} />
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="comment-count-chip">
                            <MessageSquare size={12} /> {pr.internalCommentCount} ·{" "}
                            {pr.linkedTaskCount} tasks
                          </span>
                        </td>
                        <td>
                          <span className="comment-meta">{formatDateTime(pr.githubUpdatedAt)}</span>
                        </td>
                        <td>
                          <a
                            href={pr.htmlUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="icon-action-btn"
                            title="Open on GitHub"
                            aria-label={`Open PR #${pr.number} on GitHub`}
                          >
                            <ExternalLink size={13} />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="task-cards-mobile" style={{ padding: ".85rem" }}>
                {data.items.map((pr) => (
                  <Link
                    key={pr.id}
                    href={`/app/projects/${project.id}/pull-requests/${pr.number}`}
                    className="task-mobile-card"
                  >
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <span className="project-key">#{pr.number}</span>
                      <PullRequestStateBadge state={pr.state} isDraft={pr.isDraft} />
                    </div>
                    <strong>{pr.title}</strong>
                    <span className="comment-meta">
                      {pr.authorLogin} · {pr.headRef} → {pr.baseRef}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {totalPages > 1 && (
            <div className="inline-actions" style={{ justifyContent: "space-between" }}>
              <span className="field-hint">
                Page {page} of {totalPages} ({data.total} total)
              </span>
              <div className="inline-actions">
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="compact"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
