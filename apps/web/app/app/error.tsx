"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function WorkspaceRouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="empty-panel" role="alert">
      <AlertTriangle size={24} aria-hidden="true" />
      <h2>Unable to load this workspace view</h2>
      <p>
        A temporary error occurred while contacting the workspace service. Try again or return to
        your workspace overview.
      </p>
      <div className="inline-actions">
        <Button type="button" size="compact" onClick={() => reset()}>
          Try again
        </Button>
        <Button asChild variant="secondary" size="compact">
          <Link href="/app">Workspace overview</Link>
        </Button>
      </div>
    </section>
  );
}
