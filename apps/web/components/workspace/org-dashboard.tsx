import Link from "next/link";
import { ArrowRight, FolderGit2, FolderPlus, MailPlus, ShieldCheck, UsersRound } from "lucide-react";
import type { OrganizationDashboardDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRole(role: string) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

export function OrganizationDashboard({ data }: { data: OrganizationDashboardDto }) {
  const { organization, stats, projects, members, recentActivity } = data;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> Organization overview ·{" "}
            <span className="badge badge-accent">{formatRole(organization.role)}</span>
          </p>
          <h1>{organization.name}</h1>
          <p className="page-subtitle">
            {organization.description ||
              `Manage projects, team memberships, and access permissions for ${organization.slug}.`}
          </p>
        </div>

        <div className="page-actions">
          <Button asChild variant="secondary" size="compact">
            <Link href="/app/invitations">
              <MailPlus size={15} />
              Invite Member
            </Link>
          </Button>
          <Button asChild size="compact">
            <Link href="/app/projects?create=1">
              <FolderPlus size={15} />
              New Project
            </Link>
          </Button>
        </div>
      </header>

      <dl className="stat-grid" aria-label="Organization metrics">
        <div className="stat-card">
          <dt>Total members</dt>
          <dd>{stats.totalMembers}</dd>
        </div>
        <div className="stat-card">
          <dt>Total projects</dt>
          <dd>{stats.totalProjects}</dd>
        </div>
        <div className="stat-card">
          <dt>Active projects</dt>
          <dd>{stats.activeProjects}</dd>
        </div>
        <div className="stat-card">
          <dt>Archived projects</dt>
          <dd>{stats.archivedProjects}</dd>
        </div>
        <div className="stat-card">
          <dt>Pending invitations</dt>
          <dd>{stats.pendingInvitations}</dd>
        </div>
      </dl>

      <div className="panel-grid">
        <section className="app-card" aria-labelledby="org-projects-heading">
          <div className="app-card-header">
            <h2 id="org-projects-heading">Projects</h2>
            <Link href="/app/projects" className="badge">
              View all ({projects.length})
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="empty-panel">
              <FolderGit2 size={24} />
              <h3>No projects yet</h3>
              <p>Create your first project to organize engineering work and assign project managers.</p>
              <Button asChild size="compact">
                <Link href="/app/projects?create=1">Create your first project</Link>
              </Button>
            </div>
          ) : (
            <div className="form-stack">
              {projects.slice(0, 6).map((project) => (
                <article
                  key={project.id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: ".75rem",
                    paddingBottom: ".85rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="inline-actions" style={{ gap: ".5rem" }}>
                      <span className="project-key">{project.key}</span>
                      <Link href={`/app/projects/${project.id}`} style={{ fontWeight: 600 }}>
                        {project.name}
                      </Link>
                      <span className={`badge ${project.status === "ACTIVE" ? "badge-accent" : "badge-warm"}`}>
                        {project.status}
                      </span>
                    </div>
                    <p className="field-hint" style={{ marginTop: ".25rem" }}>
                      {project.projectManagers.length > 0
                        ? `PM: ${project.projectManagers.map((pm) => pm.name || pm.email).join(", ")}`
                        : "No assigned project manager"}
                    </p>
                  </div>
                  <div className="inline-actions">
                    <Button asChild variant="secondary" size="compact">
                      <Link href={`/app/projects/${project.id}`}>Open</Link>
                    </Button>
                    <Button asChild size="compact">
                      <Link href={`/app/projects/${project.id}/manage`}>
                        <ShieldCheck size={14} /> Manage
                      </Link>
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <div className="form-stack">
          <section className="app-card" aria-labelledby="org-members-heading">
            <div className="app-card-header">
              <h2 id="org-members-heading">Team summary</h2>
              <Link href="/app/members" className="badge">
                Manage <ArrowRight size={12} />
              </Link>
            </div>
            <div className="form-stack" style={{ gap: ".7rem" }}>
              {members.slice(0, 5).map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: ".65rem",
                  }}
                >
                  <div className="member-cell">
                    <span className="avatar">
                      {(member.name || member.email).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="member-cell-text">
                      <strong>{member.name || member.email}</strong>
                      <small>{member.email}</small>
                    </div>
                  </div>
                  <span className={`badge ${member.role === "OWNER" ? "badge-accent" : ""}`}>
                    {formatRole(member.role)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "1rem", paddingTop: ".85rem", borderTop: "1px solid var(--border)" }}>
              <Link href="/app/members" className="inline-actions" style={{ fontSize: ".88rem", color: "var(--accent-ink)" }}>
                <UsersRound size={15} /> Open full member directory
              </Link>
            </div>
          </section>

          <section className="app-card" aria-labelledby="org-activity-heading">
            <div className="app-card-header">
              <h2 id="org-activity-heading">Recent organization activity</h2>
            </div>
            {recentActivity.length === 0 ? (
              <p className="field-hint">No organization events recorded yet.</p>
            ) : (
              <ul className="activity-list">
                {recentActivity.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="activity-item">
                    <p>{entry.summary}</p>
                    <small>
                      {entry.actor?.name || entry.actor?.email || "System"} ·{" "}
                      {formatDate(entry.createdAt)}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
