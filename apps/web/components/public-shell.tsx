import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { Navigation } from "./navigation";
import { repositoryUrl } from "@/lib/server/config";
import { getCachedSession } from "@/lib/server/session";

export async function PublicShell({ children }: { children: ReactNode }) {
  const session = await getCachedSession();
  const authenticated = Boolean(session?.user?.id);
  const homeHref = authenticated ? "/app" : "/";
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <Navigation repository={repositoryUrl()} homeHref={homeHref} authenticated={authenticated} />
    {children}
    <footer><div className="frame footer-inner"><div><Wordmark href={homeHref} /><p>A shared engineering workspace for developers and AI agents.</p></div>
      <nav aria-label="Footer navigation"><Link href="/#product">Product</Link><Link href="/#features">Features</Link><Link href="/#architecture">Architecture</Link></nav>
      <small>© {new Date().getUTCFullYear()} DevCollab</small>
    </div></footer>
  </>;
}
