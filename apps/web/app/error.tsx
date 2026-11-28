"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalAppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="frame diagnostic">
      <h1>Something went wrong</h1>
      <p>We encountered an unexpected error rendering this page. Your saved data is unaffected.</p>
      <div style={{ marginTop: "1.25rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
        <Button type="button" size="compact" onClick={() => reset()}>
          Retry
        </Button>
        <Button asChild variant="secondary" size="compact">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}
