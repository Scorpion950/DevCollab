import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { getCachedSession } from "@/lib/server/session";
import "./auth.css";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const session = await getCachedSession();
  const homeHref = session?.user?.id ? "/app" : "/";
  return (
    <div className="access-shell">
      <header className="access-header"><Wordmark href={homeHref} /></header>
      <main className="access-main" id="main">{children}</main>
    </div>
  );
}
