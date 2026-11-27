import Link from "next/link";
import type { OrganizationInvitationDto } from "@devcollab/shared";
import { AccessRestricted } from "@/components/workspace/access-restricted";
import { InvitationsManager } from "@/components/workspace/invitations-manager";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create an organization first before inviting members.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to setup</Link>
        </Button>
      </section>
    );
  }

  if (activeOrg.role !== "OWNER" && activeOrg.role !== "ADMIN") {
    return (
      <AccessRestricted
        title="Invitation management restricted"
        description="Only organization Owners and Admins can create or revoke invitations."
      />
    );
  }

  const res = await apiUserFetch<OrganizationInvitationDto[]>(
    bootstrap.user.id,
    `/organizations/${encodeURIComponent(activeOrg.id)}/invitations`,
  );

  if (!res.ok) {
    return (
      <section className="banner banner-error" role="alert">
        {res.message}
      </section>
    );
  }

  return (
    <InvitationsManager
      orgId={activeOrg.id}
      orgName={activeOrg.name}
      actorRole={activeOrg.role}
      invitations={res.data}
    />
  );
}
