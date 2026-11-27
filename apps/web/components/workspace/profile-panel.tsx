"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRightLeft, Building2, CircleAlert, LogOut, Moon, Plus, Sun } from "lucide-react";
import type { OrganizationSummary, UserSummary } from "@devcollab/shared";
import { leaveOrganizationAction, switchOrganizationAction, type ActionState } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { useWorkspaceTheme } from "@/components/workspace-theme/workspace-theme";
import { ConfirmDialog } from "./confirm-dialog";

export function ProfilePanel({
  user,
  organizations,
  activeOrgId,
}: {
  user: UserSummary;
  organizations: OrganizationSummary[];
  activeOrgId: string | null;
}) {
  const { theme, toggleTheme } = useWorkspaceTheme();
  const [feedback, setFeedback] = useState<ActionState | null>(null);
  const [leaveTarget, setLeaveTarget] = useState<OrganizationSummary | null>(null);
  const [busy, startTransition] = useTransition();

  function handleSwitch(orgId: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await switchOrganizationAction(orgId);
      if (res?.error) setFeedback(res);
    });
  }

  function handleLeave() {
    if (!leaveTarget) return;
    const orgId = leaveTarget.id;
    startTransition(async () => {
      const res = await leaveOrganizationAction(orgId);
      if (res?.error) setFeedback(res);
      setLeaveTarget(null);
    });
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> Personal account
          </p>
          <h1>Profile &amp; organizations</h1>
          <p className="page-subtitle">
            Manage your workspace theme preference and switch between organizations you belong to.
          </p>
        </div>

        <Button asChild size="compact">
          <Link href="/app/organizations/new">
            <Plus size={15} /> Create organization
          </Link>
        </Button>
      </header>

      {feedback?.error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {feedback.error}
          </span>
        </p>
      )}

      <div className="panel-grid">
        <section className="app-card" aria-labelledby="profile-identity-heading">
          <div className="app-card-header">
            <h2 id="profile-identity-heading">Your organizations</h2>
            <span className="badge">{organizations.length} total</span>
          </div>

          {organizations.length === 0 ? (
            <div className="empty-panel">
              <Building2 size={24} />
              <h3>No organization memberships yet</h3>
              <p>Create your first organization or open a team invitation link to get started.</p>
              <Button asChild size="compact">
                <Link href="/app/organizations/new">Create organization</Link>
              </Button>
            </div>
          ) : (
            <div className="form-stack">
              {organizations.map((org) => {
                const isActive = org.id === activeOrgId;
                return (
                  <article
                    key={org.id}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: ".75rem",
                      paddingBottom: ".85rem",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <div>
                      <div className="inline-actions" style={{ gap: ".5rem" }}>
                        <strong>{org.name}</strong>
                        <span className="badge badge-accent">{org.role}</span>
                        {isActive && <span className="badge">Active</span>}
                      </div>
                      <p className="field-hint" style={{ marginTop: ".2rem" }}>
                        {org.slug} · {org.memberCount} members · {org.projectCount} projects
                      </p>
                    </div>

                    <div className="inline-actions">
                      {!isActive && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="compact"
                          disabled={busy}
                          onClick={() => handleSwitch(org.id)}
                        >
                          <ArrowRightLeft size={13} /> Switch
                        </Button>
                      )}
                      <button
                        type="button"
                        className="btn-danger-ghost"
                        disabled={busy}
                        onClick={() => setLeaveTarget(org)}
                      >
                        <LogOut size={13} /> Leave
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="app-card" aria-labelledby="profile-preferences-heading">
          <div className="app-card-header">
            <h2 id="profile-preferences-heading">Account &amp; appearance</h2>
          </div>

          <div className="form-stack">
            <div className="member-cell">
              <span className="avatar">
                {(user.name || user.email).slice(0, 1).toUpperCase()}
              </span>
              <div className="member-cell-text">
                <strong>{user.name || "DevCollab user"}</strong>
                <small>{user.email}</small>
              </div>
            </div>

            <div style={{ paddingTop: ".85rem", borderTop: "1px solid var(--border)" }}>
              <p className="field-group" style={{ marginBottom: ".5rem" }}>
                Application theme
              </p>
              <p className="field-hint" style={{ marginBottom: ".75rem" }}>
                Choose between the default Carbon dark theme and Warm Off-White theme inside the
                authenticated workspace. Public pages always stay dark.
              </p>
              <Button type="button" variant="secondary" size="compact" onClick={toggleTheme}>
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                Switch to {theme === "dark" ? "Warm Off-White" : "Dark"} theme
              </Button>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(leaveTarget)}
        title={`Leave ${leaveTarget?.name ?? ""}?`}
        description="You will lose access to this organization unless invited again. Last Owners must transfer ownership before leaving."
        confirmLabel="Leave organization"
        danger
        busy={busy}
        onConfirm={handleLeave}
        onCancel={() => setLeaveTarget(null)}
      />
    </>
  );
}
