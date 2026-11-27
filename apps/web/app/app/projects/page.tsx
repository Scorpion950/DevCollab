import Link from "next/link";
import type { OrganizationMemberDto, ProjectSummaryDto } from "@devcollab/shared";
import { ProjectsDirectory } from "@/components/workspace/projects-directory";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ create?: string }>;
}) {
  const [ctx, { create }] = await Promise.all([getWorkspaceBootstrap(), searchParams]);
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>Create an organization first</h2>
        <p>Projects belong to an organization. Complete organization setup to create or view projects.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to setup</Link>
        </Button>
      </section>
    );
  }

  const isOrgAdmin = activeOrg.role === "OWNER" || activeOrg.role === "ADMIN";
  const [projectsRes, membersRes] = await Promise.all([
    apiUserFetch<ProjectSummaryDto[]>(
      bootstrap.user.id,
      `/organizations/${encodeURIComponent(activeOrg.id)}/projects`,
    ),
    isOrgAdmin
      ? apiUserFetch<OrganizationMemberDto[]>(
          bootstrap.user.id,
          `/organizations/${encodeURIComponent(activeOrg.id)}/members`,
        )
      : Promise.resolve(null),
  ]);

  if (!projectsRes.ok) {
    return (
      <section className="banner banner-error" role="alert">
        {projectsRes.message}
      </section>
    );
  }

  return (
    <ProjectsDirectory
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      orgRole={activeOrg.role}
      projects={projectsRes.data}
      orgMembers={membersRes && membersRes.ok ? membersRes.data : []}
      currentUserId={bootstrap.user.id}
      initialOpenCreate={create === "1"}
    />
  );
}
