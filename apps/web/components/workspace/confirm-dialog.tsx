"use client";

import { useEffect, useId } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
        <h2 id={titleId}>{title}</h2>
        <p id={descId}>{description}</p>
        <div className="inline-actions" style={{ justifyContent: "flex-end", marginTop: ".5rem" }}>
          <Button type="button" variant="secondary" size="compact" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          {danger ? (
            <button type="button" className="btn-danger-ghost" disabled={busy} onClick={onConfirm}>
              {busy ? "Working…" : confirmLabel}
            </button>
          ) : (
            <Button type="button" size="compact" disabled={busy} onClick={onConfirm}>
              {busy ? "Working…" : confirmLabel}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
