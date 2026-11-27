import Link from "next/link";
import type { OrganizationMemberDto } from "@devcollab/shared";
import { AccessRestricted } from "@/components/workspace/access-restricted";
import { MembersManager } from "@/components/workspace/members-manager";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or join an organization to manage members.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to setup</Link>
        </Button>
      </section>
    );
  }

  if (activeOrg.role !== "OWNER" && activeOrg.role !== "ADMIN") {
    return (
      <AccessRestricted
        title="Member administration restricted"
        description="Only organization Owners and Admins can view and manage organization memberships."
      />
    );
  }

  const res = await apiUserFetch<OrganizationMemberDto[]>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/members`,
  );

  if (!res.ok) {
    return (
      <section className="banner banner-error" role="alert">
        {res.message}
      </section>
    );
  }

  return (
    <MembersManager
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      actorUserId={bootstrap.user.id}
      actorRole={activeOrg.role}
      members={res.data}
    />
  );
}
