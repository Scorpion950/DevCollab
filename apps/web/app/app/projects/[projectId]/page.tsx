import Link from "next/link";
import { ArrowLeft, FolderGit2, Layers3, ShieldCheck, UsersRound } from "lucide-react";
import type { ProjectDetailDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [ctx, { projectId }] = await Promise.all([getWorkspaceBootstrap(), params]);
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Select or create an organization first to view projects.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const res = await apiUserFetch<ProjectDetailDto>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/projects/${encodeURIComponent(projectId)}`,
  );

  if (!res.ok) {
    return (
      <section className="empty-panel" role="alert">
        <FolderGit2 size={26} />
        <h2>Project unavailable in {activeOrg.name}</h2>
        <p>{res.message}</p>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app/projects">
            <ArrowLeft size={14} /> Back to projects
          </Link>
        </Button>
      </section>
    );
  }

  const project = res.data;
  const developers = project.members.filter((m) => m.role === "DEVELOPER");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="project-key">{project.key}</span>
            <span className={`badge ${project.status === "ACTIVE" ? "badge-accent" : "badge-warm"}`}>
              {project.status}
            </span>
            <span>{activeOrg.name}</span>
          </p>
          <h1>{project.name}</h1>
          <p className="page-subtitle">
            {project.description || "No project description has been added yet."}
          </p>
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href="/app/projects">
              <ArrowLeft size={14} /> All projects
            </Link>
          </Button>
          {project.canManageProject && (
            <Button asChild size="compact">
              <Link href={`/app/projects/${project.id}/manage`}>
                <ShieldCheck size={15} /> Project management
              </Link>
            </Button>
          )}
        </div>
      </header>

      {project.status === "ARCHIVED" && (
        <p className="banner banner-neutral" role="status">
          This project is archived. Active development changes are paused until restored by an
          organization Owner or Admin.
        </p>
      )}

      <div className="panel-grid">
        <section className="app-card" aria-labelledby="project-overview-heading">
          <div className="app-card-header">
            <h2 id="project-overview-heading">Project workspace</h2>
            <span className="badge">Created {formatDate(project.createdAt)}</span>
          </div>

          <dl className="stat-grid" style={{ marginBottom: "1.25rem" }}>
            <div className="stat-card">
              <dt>Identifier</dt>
              <dd style={{ fontSize: "1.45rem", fontFamily: "var(--mono-font)" }}>
                {project.key}
              </dd>
            </div>
            <div className="stat-card">
              <dt>Your project role</dt>
              <dd style={{ fontSize: "1.15rem", color: "var(--foreground)" }}>
                {project.currentUserProjectRole === "PROJECT_MANAGER"
                  ? "Project Manager"
                  : project.currentUserProjectRole === "DEVELOPER"
                    ? "Developer"
                    : "Org Member"}
              </dd>
            </div>
          </dl>

          <div className="empty-panel">
            <Layers3 size={24} />
            <h3>Engineering capabilities connecting next</h3>
            <p>
              GitHub repository sync, task boards, cloud development environments, and AI coding
              reviews will attach directly to this project in upcoming development bricks.
            </p>
          </div>
        </section>

        <section className="app-card" aria-labelledby="project-team-heading">
          <div className="app-card-header">
            <h2 id="project-team-heading">Project roles</h2>
            <UsersRound size={17} />
          </div>

          <div className="form-stack">
            <div>
              <p className="sidebar-heading" style={{ paddingLeft: 0 }}>
                Project Managers
              </p>
              {project.projectManagers.length === 0 ? (
                <p className="field-hint">Managed by organization Owners and Admins.</p>
              ) : (
                <div className="form-stack" style={{ gap: ".6rem", marginTop: ".45rem" }}>
                  {project.projectManagers.map((pm) => (
                    <div
                      key={pm.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: ".5rem",
                      }}
                    >
                      <div className="member-cell">
                        <span className="avatar">
                          {(pm.name || pm.email).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="member-cell-text">
                          <strong>{pm.name || pm.email}</strong>
                          <small>{pm.email}</small>
                        </div>
                      </div>
                      <span className="badge badge-accent">PM</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ paddingTop: ".85rem", borderTop: "1px solid var(--border)" }}>
              <p className="sidebar-heading" style={{ paddingLeft: 0 }}>
                Assigned Developers
              </p>
              {developers.length === 0 ? (
                <p className="field-hint" style={{ marginTop: ".35rem" }}>
                  All active organization members can collaborate on this project. No individual
                  developer assignments added yet.
                </p>
              ) : (
                <div className="form-stack" style={{ gap: ".6rem", marginTop: ".45rem" }}>
                  {developers.map((dev) => (
                    <div
                      key={dev.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: ".5rem",
                      }}
                    >
                      <div className="member-cell">
                        <span className="avatar">
                          {(dev.name || dev.email).slice(0, 1).toUpperCase()}
                        </span>
                        <div className="member-cell-text">
                          <strong>{dev.name || dev.email}</strong>
                          <small>{dev.email}</small>
                        </div>
                      </div>
                      <span className="badge badge-sage">Developer</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
