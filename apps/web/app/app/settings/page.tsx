import Link from "next/link";
import { AccessRestricted } from "@/components/workspace/access-restricted";
import { OrgSettingsForm } from "@/components/workspace/org-settings-form";
import { Button } from "@/components/ui/button";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function OrganizationSettingsPage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const activeOrg = ctx.bootstrap.activeOrganization;
  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or join an organization to configure settings.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to setup</Link>
        </Button>
      </section>
    );
  }

  if (activeOrg.role !== "OWNER" && activeOrg.role !== "ADMIN") {
    return (
      <AccessRestricted
        title="Organization settings restricted"
        description="Only organization Owners and Admins can modify organization settings."
      />
    );
  }

  return <OrgSettingsForm organization={activeOrg} />;
}
