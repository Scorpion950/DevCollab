import Link from "next/link";
import { logout } from "@/app/auth/actions";
import { Button } from "./ui/button";

export function ProfileUnavailable() {
  return (
    <main className="frame diagnostic">
      <h1>Workspace connection interrupted</h1>
      <p>
        Your account session is active, but workspace data could not be loaded right now. Retry
        or sign out and sign in again.
      </p>
      <div className="inline-actions" style={{ marginTop: "1rem" }}>
        <Button asChild size="compact">
          <Link href="/app">Try again</Link>
        </Button>
        <form action={logout}>
          <Button variant="secondary" size="compact">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  );
}
