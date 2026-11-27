"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import type {
  GitHubAvailableRepoDto,
  ProjectDetailDto,
  ProjectRepositoryOverviewDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";
import {
  PullRequestStateBadge,
  RepoConnectionBadge,
  RepoVisibilityBadge,
} from "./github-badges";
import { ProjectSubnav } from "./project-subnav";
import { formatDateTime } from "./task-badges";

export function RepositoryOverviewPanel({
  project,
  initialOverview,
  initialInstallationId,
  setupNotice,
}: {
  project: ProjectDetailDto;
  initialOverview: ProjectRepositoryOverviewDto;
  initialInstallationId?: string | null;
  setupNotice?: "select" | "cancelled" | null;
}) {
  const [overview, setOverview] = useState<ProjectRepositoryOverviewDto>(initialOverview);
  const [selectedInstallId, setSelectedInstallId] = useState<string>(
    initialInstallationId || initialOverview.installations[0]?.githubInstallationId || "",
  );
  const [availableRepos, setAvailableRepos] = useState<GitHubAvailableRepoDto[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<string>("");
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [startingInstall, setStartingInstall] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    setupNotice === "cancelled"
      ? "GitHub App installation was cancelled. No repository was connected."
      : setupNotice === "select"
        ? "GitHub installation verified. Select a repository below to connect it to this project."
        : null,
  );

  const loadReposForInstallation = useCallback(
    async (githubInstallationId: string) => {
      if (!githubInstallationId || !overview.canManageRepository) {
        setAvailableRepos([]);
        setSelectedRepoId("");
        return;
      }
      setLoadingRepos(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(project.id)}/github/installations/${encodeURIComponent(githubInstallationId)}/repositories`,
          { cache: "no-store" },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.message || "Failed to load repositories for this installation.");
          setAvailableRepos([]);
          setSelectedRepoId("");
          return;
        }
        const list = Array.isArray(json) ? (json as GitHubAvailableRepoDto[]) : [];
        setAvailableRepos(list);
        setSelectedRepoId(list[0]?.githubRepoId ?? "");
      } catch {
        setError("Network error while loading accessible GitHub repositories.");
      } finally {
        setLoadingRepos(false);
      }
    },
    [overview.canManageRepository, project.id],
  );

  useEffect(() => {
    if (!overview.repository && selectedInstallId && overview.githubApp.configured) {
      void loadReposForInstallation(selectedInstallId);
    }
  }, [loadReposForInstallation, overview.githubApp.configured, overview.repository, selectedInstallId]);

  async function refreshOverview() {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(project.id)}/github/repository`,
      { cache: "no-store" },
    );
    const json = await res.json().catch(() => null);
    if (res.ok && json) {
      setOverview(json as ProjectRepositoryOverviewDto);
    }
  }

  async function handleStartGitHubInstall() {
    setStartingInstall(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/github/install/start`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.installUrl) {
        setError(json?.message || "Could not start GitHub App installation.");
        setStartingInstall(false);
        return;
      }
      window.location.assign(String(json.installUrl));
    } catch {
      setError("Network error starting GitHub App setup.");
      setStartingInstall(false);
    }
  }

  async function handleConnectRepo(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedInstallId || !selectedRepoId) return;
    setConnecting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/github/connect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            githubInstallationId: selectedInstallId,
            githubRepoId: selectedRepoId,
          }),
        },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not connect repository.");
        return;
      }
      await refreshOverview();
      setNotice("Repository connected and initial pull requests synchronized.");
    } catch {
      setError("Network error connecting GitHub repository.");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSyncNow() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/github/sync`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      await refreshOverview();
      if (!res.ok) {
        setError(json?.message || "Synchronization failed.");
        return;
      }
      setNotice("Repository metadata and pull requests synchronized.");
    } catch {
      setError("Network error during GitHub synchronization.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(project.id)}/github/disconnect`,
        { method: "POST" },
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.message || "Could not disconnect repository.");
        return;
      }
      setDisconnectOpen(false);
      await refreshOverview();
      setNotice("Repository disconnected. DevCollab tasks and history remain preserved.");
    } catch {
      setError("Network error disconnecting repository.");
    } finally {
      setDisconnecting(false);
    }
  }

  const repo = overview.repository;
  const appStatus = overview.githubApp;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span>Repository & GitHub Integration</span>
          </p>
          <h1>{repo ? repo.fullName : `${project.name} · GitHub Repository`}</h1>
          <p className="page-subtitle">
            {repo
              ? repo.description || "Connected GitHub repository for pull request tracking and internal code review."
              : "Connect a GitHub repository via the DevCollab GitHub App to review pull requests alongside your tasks."}
          </p>
          <ProjectSubnav
            projectId={project.id}
            active="repository"
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
                disabled={syncing || !appStatus.configured}
                onClick={handleSyncNow}
              >
                <RefreshCw size={14} className={syncing ? "spin-icon" : ""} />
                {syncing ? "Syncing…" : "Sync now"}
              </Button>
              <Button asChild size="compact">
                <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer">
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
      {notice && (
        <p className="banner banner-success" role="status">
          <CheckCircle2 size={16} /> {notice}
        </p>
      )}

      {!appStatus.configured && (
        <section className="app-card" aria-labelledby="gh-setup-missing">
          <div className="app-card-header">
            <h2 id="gh-setup-missing" className="inline-actions">
              <PlugZap size={17} /> GitHub App configuration required
            </h2>
            <span className="badge badge-warm">Not configured</span>
          </div>
          <p className="page-subtitle" style={{ marginTop: 0 }}>
            Server credentials for the DevCollab GitHub App have not been configured yet. Existing
            project management, tasks, and boards remain fully operational.
          </p>
          <div className="meta-kv" style={{ marginTop: "1rem" }}>
            <div>
              <dt>Missing API environment variables</dt>
              <dd>{appStatus.missingFields.join(", ")}</dd>
            </div>
            <div>
              <dt>Webhook endpoint</dt>
              <dd>/api/webhooks/github</dd>
            </div>
          </div>
        </section>
      )}

      {!repo ? (
        <section className="app-card" aria-labelledby="connect-repo-heading">
          <div className="app-card-header">
            <h2 id="connect-repo-heading" className="inline-actions">
              <FolderGit2 size={18} /> Connect a GitHub repository
            </h2>
            <span className="badge">1 repository per project</span>
          </div>

          {!overview.canManageRepository ? (
            <div className="empty-panel">
              <ShieldCheck size={24} />
              <h3>No repository connected yet</h3>
              <p>
                Only organization Owners, Admins, or assigned Project Managers can connect or
                disconnect GitHub repositories for this project.
              </p>
            </div>
          ) : !appStatus.configured ? (
            <p className="field-hint">
              Once an administrator sets the GitHub App environment variables on the API server,
              you can install the GitHub App and pick a repository here.
            </p>
          ) : (
            <div className="form-stack">
              <div className="overview-task-row" style={{ background: "var(--well)" }}>
                <div>
                  <strong>Step 1 · Authorize a GitHub account or organization</strong>
                  <p className="field-hint" style={{ marginTop: ".2rem" }}>
                    Install or configure the DevCollab GitHub App on GitHub to grant read access to
                    repository metadata and pull requests.
                  </p>
                </div>
                <Button
                  type="button"
                  size="compact"
                  disabled={startingInstall || project.status === "ARCHIVED"}
                  onClick={handleStartGitHubInstall}
                >
                  <PlugZap size={14} />
                  {startingInstall
                    ? "Redirecting to GitHub…"
                    : overview.installations.length > 0
                      ? "Install / Configure on GitHub"
                      : "Connect GitHub"}
                </Button>
              </div>

              {overview.installations.length > 0 && (
                <form onSubmit={handleConnectRepo} className="form-stack" style={{ marginTop: ".5rem" }}>
                  <strong>Step 2 · Choose installation and repository</strong>
                  <div className="panel-grid">
                    <label className="field-group">
                      GitHub installation
                      <select
                        className="field-select"
                        value={selectedInstallId}
                        onChange={(e) => {
                          setSelectedInstallId(e.target.value);
                          void loadReposForInstallation(e.target.value);
                        }}
                      >
                        {overview.installations.map((inst) => (
                          <option key={inst.id} value={inst.githubInstallationId}>
                            {inst.accountLogin} ({inst.accountType}) — {inst.status}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-group">
                      Accessible repository
                      <select
                        className="field-select"
                        disabled={loadingRepos || availableRepos.length === 0}
                        value={selectedRepoId}
                        onChange={(e) => setSelectedRepoId(e.target.value)}
                      >
                        {loadingRepos ? (
                          <option value="">Loading repositories…</option>
                        ) : availableRepos.length === 0 ? (
                          <option value="">No repositories granted to this installation</option>
                        ) : (
                          availableRepos.map((r) => (
                            <option key={r.githubRepoId} value={r.githubRepoId}>
                              {r.fullName} ({r.isPrivate ? "Private" : "Public"})
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                  </div>

                  {!loadingRepos && availableRepos.length === 0 && (
                    <p className="field-hint">
                      No repositories were returned for this installation. Use &ldquo;Install /
                      Configure on GitHub&rdquo; above to grant access to at least one repository.
                    </p>
                  )}

                  <div className="inline-actions">
                    <Button
                      type="submit"
                      size="compact"
                      disabled={connecting || loadingRepos || !selectedRepoId || project.status === "ARCHIVED"}
                    >
                      {connecting ? "Connecting & syncing…" : "Confirm repository connection"}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </section>
      ) : (
        <>
          {repo.status !== "CONNECTED" && (
            <p className="banner banner-error" role="alert">
              <AlertTriangle size={16} />{" "}
              {repo.lastSyncError ||
                "GitHub App access to this repository was revoked or suspended. Re-install on GitHub or disconnect this repository."}
            </p>
          )}

          <dl className="stat-grid" aria-label="Repository overview stats">
            <div className="stat-card">
              <dt>Connection</dt>
              <dd style={{ fontSize: "1.05rem", paddingTop: ".35rem" }}>
                <RepoConnectionBadge status={repo.status} />
              </dd>
            </div>
            <div className="stat-card">
              <dt>Visibility & Branch</dt>
              <dd style={{ fontSize: "1rem", paddingTop: ".3rem" }}>
                <span className="inline-actions" style={{ gap: ".4rem" }}>
                  <RepoVisibilityBadge isPrivate={repo.isPrivate} />
                  <span className="badge mono-badge">
                    <GitBranch size={11} /> {repo.defaultBranch}
                  </span>
                </span>
              </dd>
            </div>
            <div className="stat-card">
              <dt>Open Pull Requests</dt>
              <dd>{repo.openPrCount}</dd>
            </div>
            <div className="stat-card">
              <dt>Last Synced</dt>
              <dd style={{ fontSize: ".95rem", paddingTop: ".35rem" }}>
                {repo.lastSyncedAt ? formatDateTime(repo.lastSyncedAt) : "Not synced yet"}
              </dd>
            </div>
          </dl>

          <div className="panel-grid">
            <section className="app-card" aria-labelledby="recent-prs-heading">
              <div className="app-card-header">
                <h2 id="recent-prs-heading" className="inline-actions">
                  <GitPullRequest size={17} /> Recently updated pull requests
                </h2>
                <Link href={`/app/projects/${project.id}/pull-requests`} className="text-action-link">
                  View all PRs
                </Link>
              </div>

              {overview.recentPullRequests.length === 0 ? (
                <div className="empty-panel">
                  <p>No pull requests synced yet for {repo.fullName}.</p>
                </div>
              ) : (
                <div className="form-stack" style={{ gap: ".6rem" }}>
                  {overview.recentPullRequests.map((pr) => (
                    <Link
                      key={pr.id}
                      href={`/app/projects/${project.id}/pull-requests/${pr.number}`}
                      className="overview-task-row"
                    >
                      <div className="inline-actions" style={{ gap: ".55rem", minWidth: 0 }}>
                        <span className="project-key">#{pr.number}</span>
                        <strong className="truncate-text">{pr.title}</strong>
                      </div>
                      <div className="inline-actions" style={{ gap: ".45rem" }}>
                        <PullRequestStateBadge state={pr.state} isDraft={pr.isDraft} />
                        <span className="comment-meta">
                          {pr.headRef} → {pr.baseRef}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="app-card form-stack" aria-labelledby="repo-meta-heading">
              <h2 id="repo-meta-heading">Integration details</h2>
              <dl className="meta-kv">
                <div>
                  <dt>Owner / Account</dt>
                  <dd>{repo.owner}</dd>
                </div>
                <div>
                  <dt>Repository</dt>
                  <dd>{repo.name}</dd>
                </div>
                <div>
                  <dt>Installation account</dt>
                  <dd>
                    {repo.accountLogin} ({repo.accountType})
                  </dd>
                </div>
                <div>
                  <dt>Last sync status</dt>
                  <dd>{repo.lastSyncStatus || "IDLE"}</dd>
                </div>
                <div>
                  <dt>Pull requests summary</dt>
                  <dd>
                    {overview.counts.open} open · {overview.counts.merged} merged ·{" "}
                    {overview.counts.closed} closed
                  </dd>
                </div>
              </dl>

              {repo.lastSyncError && (
                <p className="field-hint" style={{ color: "var(--error)" }}>
                  Last error: {repo.lastSyncError}
                </p>
              )}

              {overview.canManageRepository && (
                <div
                  className="inline-actions"
                  style={{
                    justifyContent: "space-between",
                    paddingTop: ".85rem",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={startingInstall || !appStatus.configured}
                    onClick={handleStartGitHubInstall}
                  >
                    Re-authorize on GitHub
                  </Button>
                  <button
                    type="button"
                    className="btn-danger-ghost"
                    onClick={() => setDisconnectOpen(true)}
                  >
                    <Unplug size={14} /> Disconnect repository
                  </button>
                </div>
              )}
            </section>
          </div>

          <ConfirmDialog
            open={disconnectOpen}
            title={`Disconnect ${repo.fullName}?`}
            description="Disconnecting removes this repository from the project and immediately hides repository pull requests and diffs from project pages. All DevCollab tasks and task history are preserved, historical review records are retained in archived connection records, and the repository on GitHub is never deleted."
            confirmLabel="Disconnect repository"
            danger
            busy={disconnecting}
            onConfirm={handleDisconnect}
            onCancel={() => setDisconnectOpen(false)}
          />
        </>
      )}
    </>
  );
}
