"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, SunMoon, UserRound } from "lucide-react";
import { logout } from "@/app/auth/actions";
import { useWorkspaceTheme } from "./workspace-theme/workspace-theme";

export function AccountMenu({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image: string | null;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [failed, setFailed] = useState(false);
  const { theme, toggleTheme } = useWorkspaceTheme();

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (menu.current?.open && !menu.current.contains(event.target as Node)) {
        menu.current.open = false;
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  function closeMenu() {
    if (menu.current) menu.current.open = false;
  }

  return (
    <details
      className="account-menu"
      ref={menu}
      onKeyDown={(event) => {
        if (event.key === "Escape" && menu.current) {
          menu.current.open = false;
          menu.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label="Account options">
        <span className="avatar">
          {image && !failed ? (
            // Provider avatars can come from multiple external origins.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
          ) : (
            name.slice(0, 1).toUpperCase()
          )}
        </span>
        <span>{name}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </summary>
      <div className="account-options">
        <div className="account-options-head">
          <strong>{name}</strong>
          <p>{email}</p>
        </div>
        <Link href="/app/profile" onClick={closeMenu}>
          <UserRound size={16} />
          Profile &amp; organizations
        </Link>
        <button
          type="button"
          onClick={() => {
            toggleTheme();
            closeMenu();
          }}
        >
          <SunMoon size={16} />
          Use {theme === "dark" ? "warm light" : "dark"} theme
        </button>
        <form action={logout}>
          <button type="submit">
            <LogOut size={16} />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
