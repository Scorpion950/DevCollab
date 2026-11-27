"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, CircleAlert, CircleCheck, Copy, MailPlus, XCircle } from "lucide-react";
import type { OrganizationInvitationDto, OrganizationRole } from "@devcollab/shared";
import {
  createInvitationAction,
  revokeInvitationAction,
  type ActionState,
} from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadgeClass(status: OrganizationInvitationDto["status"]) {
  if (status === "PENDING") return "badge badge-accent";
  if (status === "ACCEPTED") return "badge badge-sage";
  return "badge badge-warm";
}

export function InvitationsManager({
  orgId,
  orgName,
  actorRole,
  invitations,
}: {
  orgId: string;
  orgName: string;
  actorRole: OrganizationRole;
  invitations: OrganizationInvitationDto[];
}) {
  const [createState, createAction, creating] = useActionState<ActionState, FormData>(
    createInvitationAction,
    {},
  );
  const [copied, setCopied] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionState | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<OrganizationInvitationDto | null>(null);
  const [revoking, startRevoke] = useTransition();

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  function confirmRevoke() {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    startRevoke(async () => {
      const res = await revokeInvitationAction(orgId, id);
      setActionFeedback(res);
      setRevokeTarget(null);
    });
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> {orgName} · Invitations
          </p>
          <h1>Invitations</h1>
          <p className="page-subtitle">
            Generate single-use invitation links for teammates. Share links securely — email
            delivery is not configured yet.
          </p>
        </div>
      </header>

      <section className="app-card" aria-labelledby="invite-form-heading">
        <div className="app-card-header">
          <h2 id="invite-form-heading">Invite a member</h2>
        </div>

        <form action={createAction} className="form-stack" aria-busy={creating}>
          <input type="hidden" name="orgId" value={orgId} />

          <div className="field-grid">
            <label className="field-group">
              Teammate email address
              <input
                type="email"
                name="email"
                className="field-input"
                required
                maxLength={254}
                placeholder="teammate@company.com"
              />
            </label>

            <label className="field-group">
              Intended organization role
              <select name="role" className="field-select" defaultValue="MEMBER">
                <option value="MEMBER">Member</option>
                {actorRole === "OWNER" && <option value="ADMIN">Admin</option>}
              </select>
              <span className="field-hint">
                {actorRole === "OWNER"
                  ? "Owners can invite Members or Admins."
                  : "Admins can invite Members."}
              </span>
            </label>
          </div>

          {createState.error && (
            <p className="banner banner-error" role="alert">
              <span className="inline-actions">
                <CircleAlert size={16} />
                {createState.error}
              </span>
            </p>
          )}

          <div>
            <Button type="submit" disabled={creating}>
              <MailPlus size={15} />
              {creating ? "Creating link…" : "Create Invitation Link"}
            </Button>
          </div>
        </form>

        {createState.inviteUrl && (
          <div
            className="banner banner-success"
            style={{ marginTop: "1rem", display: "grid", gap: ".65rem" }}
            role="status"
          >
            <div className="inline-actions">
              <CircleCheck size={16} />
              <strong>
                Invitation link ready for {createState.invitedEmail} ({createState.invitedRole?.toLowerCase()})
              </strong>
            </div>
            <p style={{ fontSize: ".85rem" }}>
              No email was sent automatically. Copy and share this single-use link directly — for
              security, the raw token is only shown once.
            </p>
            <div className="inline-actions" style={{ width: "100%" }}>
              <input
                type="text"
                readOnly
                aria-label="Invitation URL"
                className="field-input mono-input"
                style={{ flex: "1 1 16rem", minHeight: "2.35rem" }}
                value={createState.inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button
                type="button"
                variant="secondary"
                size="compact"
                onClick={() => copyLink(createState.inviteUrl!)}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </div>
        )}
      </section>

      {actionFeedback?.error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {actionFeedback.error}
          </span>
        </p>
      )}
      {actionFeedback?.success && (
        <p className="banner banner-success" role="status">
          <span className="inline-actions">
            <CircleCheck size={16} />
            {actionFeedback.success}
          </span>
        </p>
      )}

      <section className="app-card" aria-labelledby="invitations-list-heading">
        <div className="app-card-header">
          <h2 id="invitations-list-heading">Invitation ledger</h2>
          <span className="badge">{invitations.length} records</span>
        </div>

        {invitations.length === 0 ? (
          <div className="empty-panel">
            <h3>No invitations issued yet</h3>
            <p>
              Create an invitation link above to invite developers, project managers, or admins
              into {orgName}.
            </p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Invited by</th>
                  <th>Expires</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontFamily: "var(--mono-font)", fontSize: ".83rem" }}>
                      {inv.email}
                    </td>
                    <td>
                      <span className="badge">{inv.role}</span>
                    </td>
                    <td>
                      <span className={statusBadgeClass(inv.status)}>{inv.status}</span>
                    </td>
                    <td style={{ fontSize: ".86rem", color: "var(--muted-foreground)" }}>
                      {inv.invitedBy?.name || inv.invitedBy?.email || "—"}
                    </td>
                    <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                      {formatDate(inv.expiresAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {inv.status === "PENDING" && (
                        <button
                          type="button"
                          className="btn-danger-ghost"
                          disabled={revoking}
                          onClick={() => setRevokeTarget(inv)}
                        >
                          <XCircle size={13} /> Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke invitation?"
        description={`Invalidate the pending invitation link for ${revokeTarget?.email ?? ""}? It will no longer be usable.`}
        confirmLabel="Revoke invitation"
        danger
        busy={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
