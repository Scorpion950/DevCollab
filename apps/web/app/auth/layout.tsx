import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import "./auth.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="access-shell">
      <header className="access-header"><Wordmark /></header>
      <main className="access-main" id="main">{children}</main>
    </div>
  );
}
