import Link from "next/link";
import { ArrowLeft, Code2 } from "lucide-react";
import type { ProjectIdeOverviewDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { ProjectIdeWorkspace } from "@/components/workspace/ide/project-ide-workspace";
import { ProjectSubnav } from "@/components/workspace/project-subnav";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectIdePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ workspaceId?: string; taskId?: string; proposalId?: string }>;
}) {
  const [ctx, { projectId }, { workspaceId, taskId, proposalId }] = await Promise.all([
    getWorkspaceBootstrap(),
    params,
    searchParams,
  ]);
  if (!ctx) return null;

  const activeOrg = ctx.bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Select or create an organization before opening the Browser IDE.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const res = await apiUserFetch<ProjectIdeOverviewDto>(
    ctx.bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}/ide/overview`,
  );

  if (!res.ok) {
    return (
      <section className="empty-panel" role="alert">
        <Code2 size={26} />
        <h2>Browser IDE unavailable</h2>
        <p>{res.message}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(projectId)}`}>
            <ArrowLeft size={14} /> Project overview
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <>
      <header className="page-header" style={{ paddingBottom: ".75rem" }}>
        <div>
          <p className="eyebrow">
            <span className="project-key">{res.data.project.key}</span>
            <span>{activeOrg.name} · Browser IDE</span>
          </p>
          <h1>{res.data.project.name} Workspace</h1>
          <ProjectSubnav
            projectId={projectId}
            active="ide"
            canManageProject={res.data.project.canManageProject}
          />
        </div>

        <Button asChild variant="secondary" size="compact">
          <Link href={`/app/projects/${encodeURIComponent(projectId)}/repository`}>
            <ArrowLeft size={14} /> Repository
          </Link>
        </Button>
      </header>

      <ProjectIdeWorkspace
        projectId={projectId}
        initialOverview={res.data}
        initialWorkspaceId={workspaceId ?? null}
        initialTaskId={taskId ?? null}
        initialProposalId={proposalId ?? null}
      />
    </>
  );
}
