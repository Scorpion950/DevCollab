"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { CircleAlert, Columns3, FolderGit2, FolderPlus, Search, ShieldCheck, X } from "lucide-react";
import type { OrganizationMemberDto, OrganizationRole, ProjectSummaryDto } from "@devcollab/shared";
import { createProjectAction, type ActionState } from "@/app/app/actions";
import { Button } from "@/components/ui/button";

function suggestKey(name: string): string {
  const words = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0]!.slice(0, 4);
  return words
    .slice(0, 4)
    .map((w) => w[0])
    .join("");
}

export function ProjectsDirectory({
  orgId,
  orgName,
  orgRole,
  projects,
  orgMembers,
  currentUserId,
  initialOpenCreate = false,
}: {
  orgId: string;
  orgName: string;
  orgRole: OrganizationRole;
  projects: ProjectSummaryDto[];
  orgMembers: OrganizationMemberDto[];
  currentUserId: string;
  initialOpenCreate?: boolean;
}) {
  const canCreate = orgRole === "OWNER" || orgRole === "ADMIN";
  const [showCreate, setShowCreate] = useState(canCreate && initialOpenCreate);
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);

  const [state, createAction, pending] = useActionState<ActionState, FormData>(
    createProjectAction,
    {},
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (statusFilter !== "ALL" && project.status !== statusFilter) return false;
      if (!q) return true;
      return (
        project.name.toLowerCase().includes(q) ||
        project.key.toLowerCase().includes(q) ||
        (project.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [projects, query, statusFilter]);

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> {orgName} · Projects
          </p>
          <h1>Projects</h1>
          <p className="page-subtitle">
            Browse projects in {orgName}. Authorized owners, admins, and assigned project managers
            can open project management dashboards.
          </p>
        </div>

        {canCreate && (
          <div className="page-actions">
            <Button
              type="button"
              size="compact"
              onClick={() => setShowCreate((prev) => !prev)}
            >
              {showCreate ? <X size={15} /> : <FolderPlus size={15} />}
              {showCreate ? "Close form" : "New Project"}
            </Button>
          </div>
        )}
      </header>

      {canCreate && showCreate && (
        <section className="app-card" aria-labelledby="create-project-heading">
          <div className="app-card-header">
            <h2 id="create-project-heading">Create a project</h2>
          </div>

          <form action={createAction} className="form-stack" aria-busy={pending}>
            <input type="hidden" name="orgId" value={orgId} />

            <div className="field-grid">
              <label className="field-group">
                Project name
                <input
                  type="text"
                  name="name"
                  className="field-input"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => {
                    const next = e.target.value;
                    setName(next);
                    if (!keyEdited) setKey(suggestKey(next));
                  }}
                  placeholder="Atlas API"
                />
              </label>

              <label className="field-group">
                Project key
                <input
                  type="text"
                  name="key"
                  className="field-input mono-input"
                  required
                  minLength={2}
                  maxLength={10}
                  pattern="[A-Za-z][A-Za-z0-9]{1,9}"
                  value={key}
                  onChange={(e) => {
                    setKeyEdited(true);
                    setKey(e.target.value.toUpperCase());
                  }}
                  placeholder="ATL"
                />
                <span className="field-hint">2–10 uppercase letters or digits (e.g. ATL).</span>
              </label>
            </div>

            <div className="field-grid">
              <label className="field-group">
                Initial status
                <select name="status" className="field-select" defaultValue="ACTIVE">
                  <option value="ACTIVE">Active</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </label>

              <label className="field-group">
                Project manager (optional)
                <select
                  name="projectManagerId"
                  className="field-select"
                  defaultValue={currentUserId}
                >
                  {orgMembers.map((member) => (
                    <option key={member.userId} value={member.userId}>
                      {member.name || member.email} ({member.role.toLowerCase()})
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  Defaults to you and can be reassigned anytime in project management.
                </span>
              </label>
            </div>

            <label className="field-group">
              Description (optional)
              <textarea
                name="description"
                className="field-textarea"
                maxLength={1000}
                placeholder="Backend API development and engineering collaboration."
              />
            </label>

            {state.error && (
              <p className="banner banner-error" role="alert">
                <span className="inline-actions">
                  <CircleAlert size={16} />
                  {state.error}
                </span>
              </p>
            )}

            <div>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating project…" : "Create Project"}
              </Button>
            </div>
          </form>
        </section>
      )}

      <section className="form-stack" aria-label="Filter projects">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: ".75rem",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div className="inline-actions" role="group" aria-label="Status filter">
            {(["ACTIVE", "ARCHIVED", "ALL"] as const).map((status) => (
              <Button
                key={status}
                type="button"
                size="compact"
                variant={statusFilter === status ? "primary" : "secondary"}
                onClick={() => setStatusFilter(status)}
              >
                {status === "ALL" ? "All" : status === "ACTIVE" ? "Active" : "Archived"}
              </Button>
            ))}
          </div>

          <label style={{ position: "relative", minWidth: "min(100%, 18rem)" }}>
            <span className="sr-only">Search projects</span>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: ".8rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted-foreground)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              className="field-input"
              style={{ paddingLeft: "2.2rem", minHeight: "2.45rem" }}
              placeholder="Search by name or key…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-panel">
            <FolderGit2 size={26} />
            <h2>
              {projects.length === 0
                ? "No projects in this organization yet"
                : "No projects match your filter"}
            </h2>
            <p>
              {projects.length === 0
                ? canCreate
                  ? "Create your first project to organize team permissions and upcoming workflows."
                  : "Projects created by your organization’s Owners or Admins will appear here."
                : "Try switching between Active, Archived, and All, or clearing your search query."}
            </p>
            {projects.length === 0 && canCreate && !showCreate && (
              <Button type="button" size="compact" onClick={() => setShowCreate(true)}>
                <FolderPlus size={15} /> Create project
              </Button>
            )}
          </div>
        ) : (
          <div className="card-grid">
            {filtered.map((project) => (
              <article key={project.id} className="project-card">
                <div className="project-card-top">
                  <span className="project-key">{project.key}</span>
                  <span
                    className={`badge ${
                      project.status === "ACTIVE" ? "badge-accent" : "badge-warm"
                    }`}
                  >
                    {project.status}
                  </span>
                </div>

                <div>
                  <h3>
                    <Link href={`/app/projects/${project.id}`}>{project.name}</Link>
                  </h3>
                  <p style={{ marginTop: ".35rem" }}>
                    {project.description || "No description provided."}
                  </p>
                </div>

                <p className="field-hint">
                  {project.projectManagers.length > 0
                    ? `Project manager: ${project.projectManagers
                        .map((pm) => pm.name || pm.email)
                        .join(", ")}`
                    : "Project manager: Organization admins"}
                </p>

                <div className="project-card-foot">
                  <div className="inline-actions" style={{ gap: ".45rem" }}>
                    <Button asChild variant="secondary" size="compact">
                      <Link href={`/app/projects/${project.id}`}>Overview</Link>
                    </Button>
                    <Button asChild variant="secondary" size="compact">
                      <Link href={`/app/projects/${project.id}/tasks`}>
                        <Columns3 size={14} /> Board
                      </Link>
                    </Button>
                  </div>
                  {project.canManageProject && (
                    <Button asChild size="compact">
                      <Link href={`/app/projects/${project.id}/manage`}>
                        <ShieldCheck size={14} /> Manage
                      </Link>
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
