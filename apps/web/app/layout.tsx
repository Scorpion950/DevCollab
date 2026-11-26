import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "DevCollab — Build together. Ship smarter.",
  description: "One engineering workspace where developers and autonomous AI agents collaborate to turn tasks into working software.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" className="dark"><body>{children}</body></html>;
}
