"use client";

import { SessionProvider, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

function SessionBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useSession({
    required: true,
    onUnauthenticated: () => router.replace("/auth/sign-in?error=SessionRequired"),
  });
  // The server has already authorized the initial render and fetched the stored profile.
  return <div aria-busy={status === "loading"}>{children}</div>;
}

export function WorkspaceSession({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <SessionProvider session={session} refetchInterval={300} refetchWhenOffline={false}>
      <SessionBoundary>{children}</SessionBoundary>
    </SessionProvider>
  );
}
