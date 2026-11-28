import Link from "next/link";
import { ArrowLeft, Bot, Sparkles } from "lucide-react";
import type { ProjectAiOverviewDto, ProjectDetailDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { AgentRunStatusBadge, formatUsd } from "@/components/workspace/ai-badges";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import { formatDateTime } from "@/components/workspace/task-badges";
import { apiUserFetch } from "@/lib/server/backend";
import { loadWithActiveOrg } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectAiOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { ctx, data: results } = await loadWithActiveOrg((userId, orgId) =>
    Promise.all([
      apiUserFetch<ProjectDetailDto>(
        userId,
        `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}`,
      ),
      apiUserFetch<ProjectAiOverviewDto>(
        userId,
        `/organizations/${encodeURIComponent(orgId)}/projects/${encodeURIComponent(projectId)}/ai/overview`,
      ),
    ]),
  );
  if (!ctx) return null;

  const activeOrg = ctx.bootstrap.activeOrganization;
  if (!activeOrg || !results) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const [projectRes, overviewRes] = results;

  if (!projectRes.ok || !overviewRes.ok) {
    return (
      <section className="empty-panel" role="alert">
        <Bot size={26} />
        <h2>AI Runs unavailable</h2>
        <p>{!projectRes.ok ? projectRes.message : !overviewRes.ok ? overviewRes.message : ""}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(projectId)}`}>
            <ArrowLeft size={14} /> Project overview
          </Link>
        </Button>
      </section>
    );
  }

  const project = projectRes.data;
  const { capability, runs, usageSummary } = overviewRes.data;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span>{activeOrg.name}</span>
          </p>
          <h1>AI Coding Agents · {project.name}</h1>
          <p className="page-subtitle">
            Auditable plan-approve-execute runs, verification status, and model usage telemetry.
          </p>
          <ProjectSubnav
            projectId={project.id}
            active="ai"
            canManageProject={project.canManageProject}
          />
        </div>

        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(project.id)}/tasks`}>
            Select a task to run AI
          </Link>
        </Button>
      </header>

      <div className="form-stack" style={{ gap: "1rem" }}>
        <section className="app-card">
          <dl className="stat-grid">
            <div className="stat-card">
              <dt>AI Provider</dt>
              <dd style={{ fontSize: "1rem" }}>
                {capability.aiConfigured ? `${capability.provider} (${capability.model})` : "Unconfigured"}
              </dd>
            </div>
            <div className="stat-card">
              <dt>Docker Sandbox</dt>
              <dd style={{ fontSize: "1rem" }}>
                {capability.sandboxAvailable ? "Available" : "Unavailable"}
              </dd>
            </div>
            <div className="stat-card">
              <dt>Total Tokens</dt>
              <dd>{usageSummary.totalTokens.toLocaleString()}</dd>
            </div>
            <div className="stat-card">
              <dt>Estimated Spend</dt>
              <dd>{formatUsd(usageSummary.estimatedCostUsd)}</dd>
            </div>
          </dl>
          <p className="field-hint" style={{ marginTop: ".75rem" }}>
            {capability.sandboxReason}
          </p>
        </section>

        <section className="app-card" aria-labelledby="project-ai-runs-heading">
          <div className="app-card-header">
            <h2 id="project-ai-runs-heading" className="inline-actions">
              <Sparkles size={17} /> Recent Agent Runs ({runs.length})
            </h2>
          </div>

          {runs.length === 0 ? (
            <div className="empty-panel">
              <Bot size={24} />
              <h3>No AI runs yet</h3>
              <p>
                Open any active task on the board or list and click <strong>Run with AI</strong> to
                start a plan-approve-execute workflow.
              </p>
              <Button asChild size="compact">
                <Link href={`/app/projects/${encodeURIComponent(project.id)}/tasks`}>
                  Browse tasks
                </Link>
              </Button>
            </div>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Repo / Base</th>
                    <th>Tokens / Cost</th>
                    <th>Started</th>
                    <th style={{ textAlign: "right" }}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <strong>{run.taskSnapshotTitle}</strong>
                      </td>
                      <td>
                        <AgentRunStatusBadge status={run.status} />
                      </td>
                      <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                        {run.baseBranch}@{run.baseCommitSha?.slice(0, 7) ?? "—"}
                      </td>
                      <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                        {run.usageTotals.totalTokens.toLocaleString()} ·{" "}
                        {formatUsd(run.usageTotals.estimatedCostUsd)}
                      </td>
                      <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                        {formatDateTime(run.createdAt)}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Button asChild variant="secondary" size="compact">
                          <Link
                            href={`/app/projects/${encodeURIComponent(project.id)}/tasks/${encodeURIComponent(run.taskId)}/agent?runId=${encodeURIComponent(run.id)}`}
                          >
                            Workspace
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
