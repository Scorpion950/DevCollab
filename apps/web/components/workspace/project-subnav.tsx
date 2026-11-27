import Link from "next/link";
import { Columns3, FolderGit2, FolderKanban, GitPullRequest, List, ShieldCheck } from "lucide-react";

export function ProjectSubnav({
  projectId,
  active,
  canManageProject,
}: {
  projectId: string;
  active: "overview" | "board" | "list" | "repository" | "pull-requests" | "manage";
  canManageProject: boolean;
}) {
  const base = `/app/projects/${projectId}`;
  return (
    <nav className="project-subnav" aria-label="Project sections">
      <Link
        href={base}
        className="project-subnav-link"
        aria-current={active === "overview" ? "page" : undefined}
      >
        <FolderKanban size={15} /> Overview
      </Link>
      <Link
        href={`${base}/tasks`}
        className="project-subnav-link"
        aria-current={active === "board" ? "page" : undefined}
      >
        <Columns3 size={15} /> Board
      </Link>
      <Link
        href={`${base}/tasks?view=list`}
        className="project-subnav-link"
        aria-current={active === "list" ? "page" : undefined}
      >
        <List size={15} /> List
      </Link>
      <Link
        href={`${base}/repository`}
        className="project-subnav-link"
        aria-current={active === "repository" ? "page" : undefined}
      >
        <FolderGit2 size={15} /> Repository
      </Link>
      <Link
        href={`${base}/pull-requests`}
        className="project-subnav-link"
        aria-current={active === "pull-requests" ? "page" : undefined}
      >
        <GitPullRequest size={15} /> Pull Requests
      </Link>
      {canManageProject && (
        <Link
          href={`${base}/manage`}
          className="project-subnav-link"
          aria-current={active === "manage" ? "page" : undefined}
        >
          <ShieldCheck size={15} /> Management
        </Link>
      )}
    </nav>
  );
}
