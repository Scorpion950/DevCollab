import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="frame diagnostic">
      <div style={{ marginBottom: "1.5rem" }}>
        <Wordmark href="/" />
      </div>
      <h1>Page not found</h1>
      <p>The page or resource you requested does not exist or may have moved.</p>
      <div className="inline-actions" style={{ marginTop: "1.25rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
        <Button asChild size="compact">
          <Link href="/app">Open workspace</Link>
        </Button>
        <Button asChild variant="secondary" size="compact">
          <Link href="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}
