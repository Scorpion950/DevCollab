import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateOrganizationForm } from "@/components/workspace/create-org-form";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default function NewOrganizationPage() {
  return (
    <div className="onboarding-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> Organizations
          </p>
          <h1>Create a new organization</h1>
          <p className="page-subtitle">
            Each organization has isolated projects, team memberships, and role-based permissions.
          </p>
        </div>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app">
            <ArrowLeft size={15} /> Back
          </Link>
        </Button>
      </header>

      <CreateOrganizationForm />
    </div>
  );
}
