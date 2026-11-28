"use client";

import { useEffect, useId, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      cancelBtnRef.current?.focus();
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
        return;
      }
      if (event.key === "Tab" && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      if (previousFocus && typeof previousFocus.focus === "function") {
        previousFocus.focus();
      }
    };
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
      <div
        ref={dialogRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <h2 id={titleId}>{title}</h2>
        <p id={descId}>{description}</p>
        <div className="inline-actions" style={{ justifyContent: "flex-end", marginTop: ".5rem" }}>
          <Button
            ref={cancelBtnRef}
            type="button"
            variant="secondary"
            size="compact"
            disabled={busy}
            onClick={onCancel}
          >
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
