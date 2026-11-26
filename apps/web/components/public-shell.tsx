import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { Navigation } from "./navigation";
import { repositoryUrl } from "@/lib/server/config";

export function PublicShell({ children }: { children: ReactNode }) {
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <Navigation repository={repositoryUrl()} />
    {children}
    <footer><div className="frame footer-inner"><div><Wordmark /><p>A shared engineering workspace for developers and AI agents.</p></div>
      <nav aria-label="Footer navigation"><Link href="/#product">Product</Link><Link href="/#features">Features</Link><Link href="/#architecture">Architecture</Link></nav>
      <small>© {new Date().getUTCFullYear()} DevCollab</small>
    </div></footer>
  </>;
}
