import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccessRestricted({
  title = "Access restricted",
  description = "Your current organization or project role does not authorize access to this management view.",
  backHref = "/app",
  backLabel = "Return to workspace",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <section className="empty-panel" role="alert">
      <ShieldAlert size={28} />
      <h2>{title}</h2>
      <p>{description}</p>
      <Button asChild variant="secondary" size="compact">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
    </section>
  );
}
