import { ProfilePanel } from "@/components/workspace/profile-panel";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const { bootstrap } = ctx;
  return (
    <ProfilePanel
      user={bootstrap.user}
      organizations={bootstrap.organizations}
      activeOrgId={bootstrap.activeOrganization?.id ?? null}
    />
  );
}
