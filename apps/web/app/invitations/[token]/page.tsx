import Link from "next/link";
import { CircleAlert, MailCheck, ShieldAlert } from "lucide-react";
import type { InvitationInspectDto } from "@devcollab/shared";
import { logout } from "@/app/auth/actions";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { InviteAcceptCard } from "@/components/workspace/invite-accept-card";
import { apiServiceFetch, apiUserFetch } from "@/lib/server/backend";
import { getCachedSession } from "@/lib/server/session";
import "../../workspace.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Organization invitation · DevCollab" };

export default async function InvitationAcceptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, session] = await Promise.all([params, getCachedSession()]);
  const authenticated = Boolean(session?.user?.id);
  const homeHref = authenticated ? "/app" : "/";
  const callbackPath = `/invitations/${encodeURIComponent(token)}`;

  const inspectRes = authenticated
    ? await apiUserFetch<InvitationInspectDto>(session!.user!.id!, "/invitations/inspect", {
        method: "POST",
        body: { token },
      })
    : await apiServiceFetch<InvitationInspectDto>("/invitations/public-inspect", {
        method: "POST",
        body: { token },
      });

  const info = inspectRes.ok ? inspectRes.data : null;

  return (
    <div className="invite-shell">
      <header>
        <Wordmark href={homeHref} />
      </header>

      <main id="main" className="app-card">
        {!inspectRes.ok || !info ? (
          <div className="form-stack">
            <h1>Invitation unavailable</h1>
            <p className="field-hint">
              {!inspectRes.ok ? inspectRes.message : "Could not verify this invitation."}
            </p>
            <div>
              <Button asChild variant="secondary">
                <Link href={homeHref}>{authenticated ? "Open workspace" : "Return home"}</Link>
              </Button>
            </div>
          </div>
        ) : info.state === "INVALID" ? (
          <div className="form-stack">
            <p className="eyebrow">
              <CircleAlert size={14} /> Invalid invitation
            </p>
            <h1>Invitation not found</h1>
            <p className="field-hint">
              This invitation link is invalid or incomplete. Ask an organization Owner or Admin to
              generate a new invitation link.
            </p>
            <div>
              <Button asChild variant="secondary">
                <Link href={homeHref}>{authenticated ? "Open workspace" : "Return home"}</Link>
              </Button>
            </div>
          </div>
        ) : info.state === "REVOKED" || info.state === "EXPIRED" || info.state === "ACCEPTED" ? (
          <div className="form-stack">
            <p className="eyebrow">
              <ShieldAlert size={14} /> {info.state}
            </p>
            <h1>
              {info.state === "REVOKED"
                ? "Invitation revoked"
                : info.state === "EXPIRED"
                  ? "Invitation expired"
                  : "Invitation already used"}
            </h1>
            <p className="field-hint">
              {info.state === "REVOKED"
                ? `The invitation to ${info.organizationName ?? "this organization"} has been revoked by an administrator.`
                : info.state === "EXPIRED"
                  ? `The invitation to ${info.organizationName ?? "this organization"} has expired. Request a new invitation link.`
                  : `This invitation to ${info.organizationName ?? "this organization"} has already been accepted.`}
            </p>
            <div>
              <Button asChild variant="secondary">
                <Link href={homeHref}>{authenticated ? "Open workspace" : "Sign in"}</Link>
              </Button>
            </div>
          </div>
        ) : !authenticated ? (
          <div className="form-stack">
            <p className="eyebrow">
              <MailCheck size={14} /> Organization invitation
            </p>
            <h1>Join {info.organizationName}</h1>
            <p className="field-hint">
              You have been invited as <strong>{info.role}</strong>
              {info.invitedEmailMasked ? ` (${info.invitedEmailMasked})` : ""}. Sign in or create an
              account with that invited email address to accept.
            </p>
            <div className="inline-actions" style={{ marginTop: ".5rem" }}>
              <Button asChild>
                <Link href={`/auth/sign-in?callbackUrl=${encodeURIComponent(callbackPath)}`}>
                  Sign in to accept
                </Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href={`/auth/sign-up?callbackUrl=${encodeURIComponent(callbackPath)}`}>
                  Create account
                </Link>
              </Button>
            </div>
          </div>
        ) : info.state === "EMAIL_MISMATCH" ? (
          <div className="form-stack">
            <p className="eyebrow">
              <ShieldAlert size={14} /> Account mismatch
            </p>
            <h1>Sign in with your invited email</h1>
            <p className="field-hint">
              This invitation to <strong>{info.organizationName}</strong> was issued for{" "}
              <code>{info.invitedEmailMasked}</code>, which does not match your currently signed-in
              account (<code>{session?.user?.email}</code>).
            </p>
            <div className="inline-actions" style={{ marginTop: ".5rem" }}>
              <form action={logout}>
                <input type="hidden" name="callbackUrl" value={callbackPath} />
                <Button type="submit">Sign out and switch account</Button>
              </form>
              <Button asChild variant="secondary">
                <Link href="/app">Stay in current workspace</Link>
              </Button>
            </div>
          </div>
        ) : info.state === "ALREADY_MEMBER" ? (
          <div className="form-stack">
            <p className="eyebrow">
              <MailCheck size={14} /> Already a member
            </p>
            <h1>You are already in {info.organizationName}</h1>
            <p className="field-hint">
              Your account already holds an active membership in this organization.
            </p>
            <div>
              <Button asChild>
                <Link href="/app">Open workspace</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <p className="eyebrow">
              <MailCheck size={14} /> Ready to join
            </p>
            <h1>Join {info.organizationName}</h1>
            <p className="field-hint">
              {info.invitedByName ? `${info.invitedByName} invited you ` : "You were invited "}
              to join <strong>{info.organizationName}</strong> as{" "}
              <span className="badge badge-accent">{info.role}</span>.
            </p>
            <InviteAcceptCard token={token} />
          </div>
        )}
      </main>
    </div>
  );
}
