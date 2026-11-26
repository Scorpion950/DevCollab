"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import "./workspace-theme.css";

type Theme = "dark" | "light";
const storageKey = "devcollab.workspace.theme";
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

export function WorkspaceThemeProvider({ children, initialTheme = "dark" }: { children: ReactNode; initialTheme?: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      document.cookie = storageKey + "=" + next + "; Path=/app; Max-Age=31536000; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    } catch {
      // The selection still applies for this visit.
    }
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      <div data-workspace-theme={theme}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useWorkspaceTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useWorkspaceTheme requires a WorkspaceThemeProvider.");
  return value;
}
