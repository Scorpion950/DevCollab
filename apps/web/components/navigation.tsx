"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";

const sections = [
  { name: "Product", href: "/#product" }, { name: "Features", href: "/#features" }, { name: "Architecture", href: "/#architecture" },
];

export function Navigation({
  repository,
  homeHref = "/",
  authenticated = false,
}: {
  repository?: string;
  homeHref?: string;
  authenticated?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = repository ? [...sections, { name: "GitHub", href: repository }] : sections;
  const navLinks = links.map(link => (
    <Link key={link.name} href={link.href} onClick={() => setOpen(false)}>
      {link.name}
    </Link>
  ));
  return (
    <header className="masthead" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
      <div className="frame nav-inner">
        <Wordmark href={homeHref} onNavigate={() => setOpen(false)} />
        <nav aria-label="Main navigation" className="desktop-nav">{navLinks}</nav>
        <div className="nav-actions">
          <Button size="compact" asChild>
            <Link href={authenticated ? "/app" : "/auth/sign-in"} onClick={() => setOpen(false)}>
              {authenticated ? "Open Workspace" : "Get Started"}
            </Link>
          </Button>
          <button className="menu-toggle" type="button" ref={toggle} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <nav hidden={!open} id="mobile-menu" className="mobile-nav" aria-label="Mobile navigation">{navLinks}</nav>
    </header>
  );
}
