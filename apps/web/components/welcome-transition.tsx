"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { BrandMark } from "./brand";
import Link from "next/link";

export function WelcomeTransition({ firstName, loginId }: { firstName: string; loginId: string }) {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      try {
        if (sessionStorage.getItem("devcollab.welcome") === loginId) { router.replace("/app"); return; }
        sessionStorage.setItem("devcollab.welcome", loginId);
      } catch { /* Skip remains available when storage is restricted. */ }
    }
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2250;
    const timer = setTimeout(() => router.replace("/app"), delay);
    return () => clearTimeout(timer);
  }, [loginId, router]);
  return <main className="welcome-screen"><div className="welcome-copy"><BrandMark/><h1>Welcome, <em>{firstName}</em>.</h1><p>Let’s build something incredible.</p></div>
    <Link replace href="/app">Skip introduction</Link></main>;
}
