"use client";
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "./brand";

export function WelcomeTransition({
  firstName,
  loginId,
  destination = "/app",
}: {
  firstName: string;
  loginId: string;
  destination?: string;
}) {
  const router = useRouter();
  const started = useRef(false);
  const navigated = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigateAway = useCallback(() => {
    if (navigated.current) return;
    navigated.current = true;
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    router.replace(destination);
  }, [destination, router]);

  useEffect(() => {
    router.prefetch(destination);
    if (!started.current) {
      started.current = true;
      try {
        if (sessionStorage.getItem("devcollab.welcome") === loginId) {
          navigateAway();
          return;
        }
        sessionStorage.setItem("devcollab.welcome", loginId);
      } catch {
        /* Navigation still proceeds when storage is restricted. */
      }
    }
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2250;
    timerRef.current = setTimeout(navigateAway, delay);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter" || event.key === " " || event.code === "Space") {
        event.preventDefault();
        navigateAway();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [destination, loginId, navigateAway, router]);

  return (
    <main
      className="welcome-screen"
      role="button"
      tabIndex={0}
      aria-label="Welcome to DevCollab. Click, tap, or press Enter or Space to continue to your workspace."
      onClick={navigateAway}
    >
      <div className="welcome-copy">
        <BrandMark />
        <h1>
          Welcome, <em>{firstName}</em>.
        </h1>
        <p>Let’s build something incredible.</p>
      </div>
    </main>
  );
}
