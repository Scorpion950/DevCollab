import Link from "next/link";
import { FolderGit2, Layers3, ShieldCheck, UserRound } from "lucide-react";
import type { OrganizationSummary, ProjectSummaryDto, UserSummary } from "@devcollab/shared";
import { Button } from "@/components/ui/button";

export function DeveloperWorkspace({
  user,
  organization,
  projects,
}: {
  user: UserSummary;
  organization: OrganizationSummary;
  projects: ProjectSummaryDto[];
}) {
  const activeProjects = projects.filter((project) => project.status === "ACTIVE");
  const managedProjects = projects.filter((project) => project.canManageProject);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> Developer workspace ·{" "}
            <span className="badge badge-sage">Member</span>
          </p>
          <h1>{organization.name}</h1>
          <p className="page-subtitle">
            {organization.description ||
              "Access your organization’s active engineering projects and assigned workspaces."}
          </p>
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href="/app/profile">
              <UserRound size={15} />
              Profile
            </Link>
          </Button>
          <Button asChild size="compact">
            <Link href="/app/projects">
              <FolderGit2 size={15} />
              Browse Projects
            </Link>
          </Button>
        </div>
      </header>

      <dl className="stat-grid" aria-label="Workspace summary">
        <div className="stat-card">
          <dt>Active projects</dt>
          <dd>{activeProjects.length}</dd>
        </div>
        <div className="stat-card">
          <dt>Projects you manage</dt>
          <dd>{managedProjects.length}</dd>
        </div>
        <div className="stat-card">
          <dt>Organization slug</dt>
          <dd style={{ fontSize: "1.15rem", fontFamily: "var(--mono-font)", color: "var(--foreground)" }}>
            {organization.slug}
          </dd>
        </div>
      </dl>

      <section className="app-card" aria-labelledby="dev-projects-heading">
        <div className="app-card-header">
          <h2 id="dev-projects-heading">Accessible projects</h2>
          <Link href="/app/projects" className="badge">
            All projects ({projects.length})
          </Link>
        </div>

        {activeProjects.length === 0 ? (
          <div className="empty-panel">
            <FolderGit2 size={24} />
            <h3>No active projects yet</h3>
            <p>
              Projects created by your organization’s Owners or Admins will appear here for
              development collaboration.
            </p>
          </div>
        ) : (
          <div className="card-grid">
            {activeProjects.map((project) => (
              <article key={project.id} className="project-card">
                <div className="project-card-top">
                  <span className="project-key">{project.key}</span>
                  <div className="inline-actions" style={{ gap: ".35rem" }}>
                    {project.currentUserProjectRole === "PROJECT_MANAGER" && (
                      <span className="badge badge-accent">Project Manager</span>
                    )}
                    {project.currentUserProjectRole === "DEVELOPER" && (
                      <span className="badge badge-sage">Developer</span>
                    )}
                  </div>
                </div>
                <div>
                  <h3>{project.name}</h3>
                  <p style={{ marginTop: ".35rem" }}>
                    {project.description || "No project description added yet."}
                  </p>
                </div>
                <div className="project-card-foot">
                  <Button asChild variant="secondary" size="compact">
                    <Link href={`/app/projects/${project.id}`}>Open workspace</Link>
                  </Button>
                  {project.canManageProject && (
                    <Button asChild size="compact">
                      <Link href={`/app/projects/${project.id}/manage`}>
                        <ShieldCheck size={14} /> Management
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="app-card" aria-labelledby="dev-account-heading">
        <div className="app-card-header">
          <h2 id="dev-account-heading">Workspace readiness</h2>
          <span className="badge">Signed in as {user.name || user.email}</span>
        </div>
        <p className="field-hint">
          <Layers3 size={14} style={{ display: "inline", verticalAlign: "text-bottom", marginRight: ".35rem" }} />
          Repositories, development tasks, browser IDE, and code review workflows will connect
          directly to these projects in upcoming milestones.
        </p>
      </section>
    </>
  );
}
