"use client";

import { useState, useTransition } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import { acceptInvitationAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";

export function InviteAcceptCard({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptInvitationAction(token);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="form-stack">
      {error && (
        <p className="banner banner-error" role="alert">
          <span className="inline-actions">
            <CircleAlert size={16} />
            {error}
          </span>
        </p>
      )}
      <div>
        <Button type="button" disabled={pending} onClick={handleAccept}>
          <CircleCheck size={16} />
          {pending ? "Joining organization…" : "Accept Invitation"}
        </Button>
      </div>
    </div>
  );
}
