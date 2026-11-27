"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, Crown, LogOut, MailPlus, Trash2 } from "lucide-react";
import type { OrganizationMemberDto, OrganizationRole } from "@devcollab/shared";
import {
  leaveOrganizationAction,
  removeMemberAction,
  transferOwnershipAction,
  updateMemberRoleAction,
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

function roleLabel(role: OrganizationRole) {
  if (role === "OWNER") return "Owner";
  if (role === "ADMIN") return "Admin";
  return "Member";
}

export function MembersManager({
  orgId,
  orgName,
  actorUserId,
  actorRole,
  members,
}: {
  orgId: string;
  orgName: string;
  actorUserId: string;
  actorRole: OrganizationRole;
  members: OrganizationMemberDto[];
}) {
  const [feedback, setFeedback] = useState<ActionState | null>(null);
  const [busy, startTransition] = useTransition();
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<ActionState>;
  } | null>(null);

  const ownerCount = members.filter((m) => m.role === "OWNER").length;
  const actorIsLastOwner = actorRole === "OWNER" && ownerCount <= 1;

  function executeConfirm() {
    if (!confirmState) return;
    const action = confirmState.run;
    startTransition(async () => {
      const res = await action();
      setFeedback(res);
      setConfirmState(null);
    });
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> {orgName} · Team management
          </p>
          <h1>Members</h1>
          <p className="page-subtitle">
            Manage organization membership, roles, and ownership transfers for {orgName}.
          </p>
        </div>

        <div className="page-actions">
          <Button
            type="button"
            variant="secondary"
            size="compact"
            disabled={busy || actorIsLastOwner}
            title={
              actorIsLastOwner
                ? "Transfer ownership to another member before leaving."
                : "Leave this organization"
            }
            onClick={() =>
              setConfirmState({
                title: `Leave ${orgName}?`,
                description:
                  "You will lose access to this organization’s projects and management dashboards unless re-invited.",
                confirmLabel: "Leave organization",
                danger: true,
                run: () => leaveOrganizationAction(orgId),
              })
            }
          >
            <LogOut size={14} /> Leave organization
          </Button>
          <Button asChild size="compact">
            <Link href="/app/invitations">
              <MailPlus size={15} /> Invite member
            </Link>
          </Button>
        </div>
      </header>

      {actorIsLastOwner && (
        <p className="banner banner-neutral">
          You are the sole Owner of {orgName}. Transfer ownership to another member before
          changing your role or leaving the organization.
        </p>
      )}

      {feedback?.error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {feedback.error}
          </span>
        </p>
      )}
      {feedback?.success && (
        <p className="banner banner-success" role="status">
          <span className="inline-actions">
            <CircleCheck size={16} />
            {feedback.success}
          </span>
        </p>
      )}

      <section className="app-card">
        <div className="app-card-header">
          <h2>Active members</h2>
          <span className="badge">{members.length} total</span>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => {
                const isSelf = member.userId === actorUserId;
                const display = member.name || member.email;
                const isLastOwnerRow = member.role === "OWNER" && ownerCount <= 1;
                const canOwnerChangeRole = actorRole === "OWNER" && !isLastOwnerRow;
                const canTransferTo = actorRole === "OWNER" && !isSelf;
                const canRemove =
                  !isSelf &&
                  !isLastOwnerRow &&
                  (actorRole === "OWNER" || (actorRole === "ADMIN" && member.role === "MEMBER"));

                return (
                  <tr key={member.id}>
                    <td>
                      <div className="member-cell">
                        <span className="avatar">{display.slice(0, 1).toUpperCase()}</span>
                        <div className="member-cell-text">
                          <strong>
                            {display} {isSelf && <span className="badge">You</span>}
                          </strong>
                          <small>{member.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${member.role === "OWNER" ? "badge-accent" : ""}`}>
                        {roleLabel(member.role)}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-sage">{member.status}</span>
                    </td>
                    <td style={{ fontFamily: "var(--mono-font)", fontSize: ".78rem" }}>
                      {formatDate(member.joinedAt)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="inline-actions" style={{ justifyContent: "flex-end" }}>
                        {canOwnerChangeRole && member.role !== "ADMIN" && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={busy}
                            onClick={() =>
                              setConfirmState({
                                title: `Promote ${display} to Admin?`,
                                description:
                                  "Admins can manage projects, invite Members, and access organization dashboards.",
                                confirmLabel: "Make Admin",
                                run: () => updateMemberRoleAction(orgId, member.id, "ADMIN"),
                              })
                            }
                          >
                            Make Admin
                          </Button>
                        )}

                        {canOwnerChangeRole && member.role !== "MEMBER" && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={busy}
                            onClick={() =>
                              setConfirmState({
                                title: `Change ${display} to Member?`,
                                description:
                                  "Members lose access to organization management dashboards and member administration.",
                                confirmLabel: "Set as Member",
                                run: () => updateMemberRoleAction(orgId, member.id, "MEMBER"),
                              })
                            }
                          >
                            Set Member
                          </Button>
                        )}

                        {canTransferTo && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={busy}
                            onClick={() =>
                              setConfirmState({
                                title: `Transfer ownership to ${display}?`,
                                description: `${display} will become the Owner of ${orgName}, and your role will change to Admin.`,
                                confirmLabel: "Transfer ownership",
                                run: () => transferOwnershipAction(orgId, member.id),
                              })
                            }
                          >
                            <Crown size={13} /> Transfer owner
                          </Button>
                        )}

                        {canRemove && (
                          <button
                            type="button"
                            className="btn-danger-ghost"
                            disabled={busy}
                            onClick={() =>
                              setConfirmState({
                                title: `Remove ${display}?`,
                                description: `${display} will lose access to ${orgName} and all project assignments inside it.`,
                                confirmLabel: "Remove member",
                                danger: true,
                                run: () => removeMemberAction(orgId, member.id),
                              })
                            }
                          >
                            <Trash2 size={13} /> Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        busy={busy}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </>
  );
}
