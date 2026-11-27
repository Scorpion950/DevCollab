import Link from "next/link";
import type { MyTasksResponseDto } from "@devcollab/shared";
import { MyTasksPanel } from "@/components/workspace/my-tasks-panel";
import { Button } from "@/components/ui/button";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";

export const dynamic = "force-dynamic";

export default async function MyTasksPage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;

  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;

  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h2>No active organization</h2>
        <p>Create or join an organization to view tasks assigned to you.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to setup</Link>
        </Button>
      </section>
    );
  }

  const res = await apiUserFetch<MyTasksResponseDto>(
    bootstrap.user.id,
    `/tasks/mine?scope=org&filter=active&orgId=${encodeURIComponent(activeOrg.id)}`,
  );

  if (!res.ok) {
    return (
      <section className="banner banner-error" role="alert">
        {res.message}
      </section>
    );
  }

  return <MyTasksPanel orgName={activeOrg.name} initialData={res.data} />;
}
