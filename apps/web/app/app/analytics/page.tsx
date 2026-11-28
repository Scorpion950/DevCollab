import Link from "next/link";
import { Lock } from "lucide-react";
import type {
  AiModelPricingDto,
  OrganizationAnalyticsDto,
} from "@devcollab/shared";
import { apiUserFetch } from "@/lib/server/backend";
import { getWorkspaceBootstrap } from "@/lib/server/dal";
import { OrgAnalyticsView } from "@/components/workspace/analytics/org-analytics-view";
import { Button } from "@/components/ui/button";

export default async function OrganizationAnalyticsPage() {
  const ctx = await getWorkspaceBootstrap();
  if (!ctx) return null;
  const userId = ctx.session.user!.id!;
  const { bootstrap } = ctx;
  const activeOrg = bootstrap.activeOrganization;

  if (!activeOrg) {
    return (
      <section className="empty-panel">
        <h1>No active organization</h1>
        <p>Select or create an organization first to view analytics.</p>
        <Button asChild size="compact">
          <Link href="/app">Go to workspace</Link>
        </Button>
      </section>
    );
  }

  const isOrgAdmin = activeOrg.role === "OWNER" || activeOrg.role === "ADMIN";
  if (!isOrgAdmin) {
    return (
      <section className="empty-panel">
        <Lock size={28} />
        <h1>Organization Analytics Restricted</h1>
        <p>
          Organization-wide AI spend, pricing rules, and budgets are visible only to Organization Owners and Admins. You can view your own AI usage inside Personal Insights or inspect delivery metrics for projects you belong to.
        </p>
        <div className="inline-actions">
          <Button asChild size="compact">
            <Link href="/app/tasks?view=insights">Open Personal Insights</Link>
          </Button>
          <Button asChild size="compact" variant="secondary">
            <Link href="/app/projects">Browse Projects</Link>
          </Button>
        </div>
      </section>
    );
  }

  const orgId = encodeURIComponent(activeOrg.id);
  const [analyticsRes, pricingRes] = await Promise.all([
    apiUserFetch<OrganizationAnalyticsDto>(
      userId,
      `/organizations/${orgId}/analytics/organization?preset=30d&timezone=UTC`,
    ),
    apiUserFetch<AiModelPricingDto[]>(userId, `/organizations/${orgId}/analytics/pricing`),
  ]);

  if (!analyticsRes.ok) {
    return (
      <section className="empty-panel">
        <h1>Unable to load Organization Analytics</h1>
        <p>{analyticsRes.message}</p>
      </section>
    );
  }

  return (
    <OrgAnalyticsView
      initialData={analyticsRes.data}
      initialPricing={pricingRes.ok ? pricingRes.data : []}
      initialBudgets={analyticsRes.data.budgets}
      initialAuditEvents={analyticsRes.data.budgetAuditEvents}
    />
  );
}
