"use client";

import { useActionState, useState, useTransition } from "react";
import { CircleAlert, CircleCheck, LogOut } from "lucide-react";
import type { OrganizationSummary } from "@devcollab/shared";
import {
  leaveOrganizationAction,
  updateOrganizationAction,
  type ActionState,
} from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./confirm-dialog";

export function OrgSettingsForm({
  organization,
}: {
  organization: OrganizationSummary;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    updateOrganizationAction,
    {},
  );
  const [leaveFeedback, setLeaveFeedback] = useState<ActionState | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leaving, startLeave] = useTransition();

  function handleLeave() {
    startLeave(async () => {
      const res = await leaveOrganizationAction(organization.id);
      if (res?.error) {
        setLeaveFeedback(res);
      }
      setConfirmLeave(false);
    });
  }

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">
            <span className="index-mark" /> {organization.name} · Settings
          </p>
          <h1>Organization settings</h1>
          <p className="page-subtitle">
            Update organization details and manage your membership in {organization.name}.
          </p>
        </div>
      </header>

      <section className="app-card" aria-labelledby="org-general-heading">
        <div className="app-card-header">
          <h2 id="org-general-heading">General details</h2>
          <span className="badge">{organization.role}</span>
        </div>

        <form action={action} className="form-stack" aria-busy={pending}>
          <input type="hidden" name="orgId" value={organization.id} />

          <div className="field-grid">
            <label className="field-group">
              Organization name
              <input
                type="text"
                name="name"
                className="field-input"
                required
                minLength={2}
                maxLength={80}
                defaultValue={organization.name}
              />
            </label>

            <label className="field-group">
              Organization slug
              <input
                type="text"
                readOnly
                className="field-input mono-input"
                value={organization.slug}
              />
              <span className="field-hint">Slugs remain stable to protect workspace links.</span>
            </label>
          </div>

          <label className="field-group">
            Description
            <textarea
              name="description"
              className="field-textarea"
              maxLength={500}
              defaultValue={organization.description ?? ""}
            />
          </label>

          {state.error && (
            <p className="banner banner-error" role="alert">
              <span className="inline-actions">
                <CircleAlert size={16} />
                {state.error}
              </span>
            </p>
          )}
          {state.success && (
            <p className="banner banner-success" role="status">
              <span className="inline-actions">
                <CircleCheck size={16} />
                {state.success}
              </span>
            </p>
          )}

          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save Organization Settings"}
            </Button>
          </div>
        </form>
      </section>

      <section className="app-card" aria-labelledby="org-membership-exit-heading">
        <div className="app-card-header">
          <h2 id="org-membership-exit-heading">Membership</h2>
        </div>
        <p className="field-hint" style={{ marginBottom: "1rem" }}>
          Leave this organization when you no longer need access. If you are the last Owner,
          transfer ownership on the Members page before leaving.
        </p>

        {leaveFeedback?.error && (
          <p className="banner banner-error" role="alert" style={{ marginBottom: "1rem" }}>
            <span className="inline-actions">
              <CircleAlert size={16} />
              {leaveFeedback.error}
            </span>
          </p>
        )}

        <button
          type="button"
          className="btn-danger-ghost"
          disabled={leaving}
          onClick={() => setConfirmLeave(true)}
        >
          <LogOut size={14} /> Leave {organization.name}
        </button>
      </section>

      <ConfirmDialog
        open={confirmLeave}
        title={`Leave ${organization.name}?`}
        description="You will lose access to this organization’s projects and settings until re-invited."
        confirmLabel="Leave organization"
        danger
        busy={leaving}
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  );
}
