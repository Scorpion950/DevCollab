"use client";

import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { Wordmark } from "./brand";
import { Button } from "./ui/button";

const sections = [
  { name: "Product", href: "#product" }, { name: "Features", href: "#features" }, { name: "Architecture", href: "#architecture" },
];

export function Navigation({ repository }: { repository?: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const links = repository ? [...sections, { name: "GitHub", href: repository }] : sections;
  const navLinks = links.map(link => <a key={link.name} href={link.href} onClick={() => setOpen(false)}>{link.name}</a>);
  return (
    <header className="masthead" onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        toggle.current?.focus();
      }
    }}>
      <div className="frame nav-inner">
        <Wordmark />
        <nav aria-label="Main navigation" className="desktop-nav">{navLinks}</nav>
        <div className="nav-actions">
          <Button size="compact" asChild><a href="#product" onClick={() => setOpen(false)}>Get Started</a></Button>
          <button className="menu-toggle" type="button" ref={toggle} aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <nav hidden={!open} id="mobile-menu" className="mobile-nav" aria-label="Mobile navigation">{navLinks}</nav>
    </header>
  );
}
