"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Check,
  ChevronsUpDown,
  FolderGit2,
  LayoutDashboard,
  MailPlus,
  Menu,
  Moon,
  Plus,
  Settings,
  ShieldCheck,
  Sun,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import type { ManagedProjectRef, OrganizationSummary, UserSummary } from "@devcollab/shared";
import { switchOrganizationAction } from "@/app/app/actions";
import { AccountMenu } from "@/components/account-menu";
import { Wordmark } from "@/components/brand";
import { useWorkspaceTheme } from "@/components/workspace-theme/workspace-theme";

function formatRoleLabel(role: OrganizationSummary["role"]) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

function buildBreadcrumbs(pathname: string, orgName: string | null) {
  const parts: Array<{ label: string; href?: string }> = [
    { label: orgName ?? "Workspace", href: "/app" },
  ];

  if (pathname === "/app") {
    parts.push({ label: "Overview" });
  } else if (pathname.startsWith("/app/organizations/new")) {
    parts.push({ label: "New organization" });
  } else if (pathname.startsWith("/app/projects/")) {
    parts.push({ label: "Projects", href: "/app/projects" });
    if (pathname.endsWith("/manage")) {
      parts.push({ label: "Project", href: pathname.replace(/\/manage$/, "") });
      parts.push({ label: "Management" });
    } else {
      parts.push({ label: "Project detail" });
    }
  } else if (pathname.startsWith("/app/projects")) {
    parts.push({ label: "Projects" });
  } else if (pathname.startsWith("/app/members")) {
    parts.push({ label: "Members" });
  } else if (pathname.startsWith("/app/invitations")) {
    parts.push({ label: "Invitations" });
  } else if (pathname.startsWith("/app/settings")) {
    parts.push({ label: "Organization settings" });
  } else if (pathname.startsWith("/app/profile")) {
    parts.push({ label: "Profile" });
  }

  return parts;
}

export function AppShell({
  user,
  organizations,
  activeOrganization,
  managedProjects,
  children,
}: {
  user: UserSummary;
  organizations: OrganizationSummary[];
  activeOrganization: OrganizationSummary | null;
  managedProjects: ManagedProjectRef[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSwitching, startSwitch] = useTransition();
  const switcherRef = useRef<HTMLDivElement>(null);
  const drawerBtnRef = useRef<HTMLButtonElement>(null);
  const { theme, toggleTheme } = useWorkspaceTheme();

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (switcherRef.current && !switcherRef.current.contains(event.target as Node)) {
        setSwitcherOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSwitcherOpen(false);
        if (drawerOpen) {
          setDrawerOpen(false);
          drawerBtnRef.current?.focus();
        }
      }
    }
    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [drawerOpen]);

  const isOrgAdmin =
    activeOrganization?.role === "OWNER" || activeOrganization?.role === "ADMIN";

  const breadcrumbs = buildBreadcrumbs(pathname, activeOrganization?.name ?? null);
  const displayName = user.name?.trim() || user.email;
  const safeImage = user.image && /^https:\/\//.test(user.image) ? user.image : null;

  function handleOrgSwitch(orgId: string) {
    setSwitcherOpen(false);
    setDrawerOpen(false);
    setSwitchError(null);
    if (orgId === activeOrganization?.id) return;
    startSwitch(async () => {
      const result = await switchOrganizationAction(orgId);
      if (result?.error) {
        setSwitchError(result.error);
      }
    });
  }

  function isActive(href: string) {
    if (href === "/app") return pathname === "/app";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="app-shell">
      <div
        className="sidebar-backdrop"
        data-open={drawerOpen}
        onClick={() => setDrawerOpen(false)}
        aria-hidden="true"
      />

      <aside
        id="workspace-sidebar"
        className="app-sidebar"
        data-open={drawerOpen}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand-row">
          <Wordmark href="/app" onNavigate={() => setDrawerOpen(false)} />
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => {
              setDrawerOpen(false);
              drawerBtnRef.current?.focus();
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div className="org-switcher" ref={switcherRef}>
          <button
            type="button"
            className="org-switcher-trigger"
            aria-expanded={switcherOpen}
            aria-haspopup="menu"
            disabled={isSwitching}
            onClick={() => setSwitcherOpen((prev) => !prev)}
          >
            <span className="org-switcher-meta">
              <strong>
                {isSwitching
                  ? "Switching…"
                  : activeOrganization
                    ? activeOrganization.name
                    : "No organization"}
              </strong>
              <span>
                {activeOrganization
                  ? `${formatRoleLabel(activeOrganization.role)} · ${activeOrganization.slug}`
                  : "Create or join an organization"}
              </span>
            </span>
            <ChevronsUpDown size={15} />
          </button>

          {switcherOpen && (
            <div className="org-switcher-menu" role="menu" aria-label="Switch organization">
              {organizations.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={org.id === activeOrganization?.id}
                  data-active={org.id === activeOrganization?.id}
                  className="org-switcher-item"
                  onClick={() => handleOrgSwitch(org.id)}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {org.name}
                  </span>
                  <span className="inline-actions" style={{ gap: ".3rem" }}>
                    <span className="badge">{formatRoleLabel(org.role)}</span>
                    {org.id === activeOrganization?.id && <Check size={14} />}
                  </span>
                </button>
              ))}
              {organizations.length > 0 && <div className="org-switcher-divider" />}
              <Link
                href="/app/organizations/new"
                role="menuitem"
                className="org-switcher-item"
                onClick={() => {
                  setSwitcherOpen(false);
                  setDrawerOpen(false);
                }}
              >
                <span className="inline-actions" style={{ gap: ".45rem" }}>
                  <Plus size={15} />
                  Create organization
                </span>
              </Link>
            </div>
          )}
        </div>

        {switchError && (
          <p className="banner banner-error" role="alert" style={{ fontSize: ".8rem", padding: ".55rem .7rem" }}>
            {switchError}
          </p>
        )}

        <nav className="sidebar-section" aria-label="Primary workspace sections">
          <p className="sidebar-heading">
            {activeOrganization ? (isOrgAdmin ? "Organization" : "Developer Workspace") : "Onboarding"}
          </p>

          {!activeOrganization ? (
            <Link
              href="/app"
              className="sidebar-link"
              aria-current={isActive("/app") ? "page" : undefined}
              onClick={() => setDrawerOpen(false)}
            >
              <Building2 size={17} />
              Setup organization
            </Link>
          ) : (
            <>
              <Link
                href="/app"
                className="sidebar-link"
                aria-current={isActive("/app") ? "page" : undefined}
                onClick={() => setDrawerOpen(false)}
              >
                <LayoutDashboard size={17} />
                {isOrgAdmin ? "Overview" : "Workspace"}
              </Link>
              <Link
                href="/app/projects"
                className="sidebar-link"
                aria-current={isActive("/app/projects") ? "page" : undefined}
                onClick={() => setDrawerOpen(false)}
              >
                <FolderGit2 size={17} />
                Projects
              </Link>
              {isOrgAdmin && (
                <>
                  <Link
                    href="/app/members"
                    className="sidebar-link"
                    aria-current={isActive("/app/members") ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <UsersRound size={17} />
                    Members
                  </Link>
                  <Link
                    href="/app/invitations"
                    className="sidebar-link"
                    aria-current={isActive("/app/invitations") ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <MailPlus size={17} />
                    Invitations
                  </Link>
                  <Link
                    href="/app/settings"
                    className="sidebar-link"
                    aria-current={isActive("/app/settings") ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                  >
                    <Settings size={17} />
                    Organization settings
                  </Link>
                </>
              )}
            </>
          )}
        </nav>

        {activeOrganization && managedProjects.length > 0 && (
          <nav className="sidebar-section" aria-label="Managed project dashboards">
            <p className="sidebar-heading">Project Management</p>
            {managedProjects.slice(0, 5).map((project) => {
              const href = `/app/projects/${project.id}/manage`;
              return (
                <Link
                  key={project.id}
                  href={href}
                  className="sidebar-link"
                  aria-current={pathname === href ? "page" : undefined}
                  onClick={() => setDrawerOpen(false)}
                >
                  <ShieldCheck size={16} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {project.name}
                  </span>
                  <span className="sidebar-link-key">{project.key}</span>
                </Link>
              );
            })}
          </nav>
        )}

        <nav className="sidebar-section" aria-label="Account">
          <p className="sidebar-heading">Account</p>
          <Link
            href="/app/profile"
            className="sidebar-link"
            aria-current={isActive("/app/profile") ? "page" : undefined}
            onClick={() => setDrawerOpen(false)}
          >
            <UserRound size={17} />
            Profile
          </Link>
        </nav>

        <div className="sidebar-footer">
          <strong style={{ color: "var(--foreground)" }}>{displayName}</strong>
          <span>
            {activeOrganization
              ? `${activeOrganization.name} · ${formatRoleLabel(activeOrganization.role)}`
              : "Authenticated account"}
          </span>
        </div>
      </aside>

      <div className="app-content-col">
        <header className="app-topbar">
          <div className="topbar-left">
            <button
              ref={drawerBtnRef}
              type="button"
              className="mobile-drawer-btn"
              aria-label="Open workspace navigation"
              aria-expanded={drawerOpen}
              aria-controls="workspace-sidebar"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={18} />
            </button>

            <nav aria-label="Breadcrumb" className="breadcrumbs">
              {breadcrumbs.map((crumb, index) => {
                const isLast = index === breadcrumbs.length - 1;
                return (
                  <span key={`${crumb.label}-${index}`} className="inline-actions" style={{ gap: ".4rem" }}>
                    {index > 0 && <span aria-hidden="true">/</span>}
                    {crumb.href && !isLast ? (
                      <Link href={crumb.href}>{crumb.label}</Link>
                    ) : (
                      <span aria-current={isLast ? "page" : undefined}>{crumb.label}</span>
                    )}
                  </span>
                );
              })}
            </nav>
          </div>

          <div className="topbar-right">
            <button
              type="button"
              className="theme-pill-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "warm light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              <span>{theme === "dark" ? "Warm Light" : "Dark"}</span>
            </button>
            <AccountMenu name={displayName} email={user.email} image={safeImage} />
          </div>
        </header>

        <main id="main" className="app-main">
          {children}
        </main>
      </div>
    </div>
  );
}
