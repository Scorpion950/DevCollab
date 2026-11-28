"use client";

import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plug, Power, ShieldAlert, Trash2 } from "lucide-react";
import type { WorkspaceTerminalTicketDto } from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { useWorkspaceTheme } from "@/components/workspace-theme/workspace-theme";

export function XtermTerminal({
  projectId,
  workspaceId,
  canUseTerminal,
  disabledReason,
}: {
  projectId: string;
  workspaceId: string;
  canUseTerminal: boolean;
  disabledReason: string;
}) {
  const { theme } = useWorkspaceTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [connState, setConnState] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string>(disabledReason);
  const canUseRef = useRef(canUseTerminal);
  const reasonRef = useRef(disabledReason);

  useEffect(() => {
    canUseRef.current = canUseTerminal;
    reasonRef.current = disabledReason;
    setStatusMessage(disabledReason);
  }, [canUseTerminal, disabledReason]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12.5,
      fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
      theme:
        theme === "light"
          ? { background: "#f7f4ec", foreground: "#1b1d1a", cursor: "#1f5f47" }
          : { background: "#0c1015", foreground: "#e5e9ef", cursor: "#7dd3fc" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(el);
    try {
      fitAddon.fit();
    } catch {
      // Element may be hidden initially
    }

    const disposable = term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", data }));
      }
    });

    const ro = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // Ignore hidden resize
      }
    });
    ro.observe(el);

    termRef.current = term;
    fitRef.current = fitAddon;

    if (!canUseRef.current) {
      term.writeln(`[Sandbox terminal unavailable] ${reasonRef.current}`);
    } else {
      term.writeln("Click 'Connect shell' to launch an isolated workspace container session.");
    }

    return () => {
      ro.disconnect();
      disposable.dispose();
      wsRef.current?.close();
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [workspaceId, theme]);

  async function handleConnect() {
    if (!canUseTerminal) return;
    setConnState("connecting");
    setStatusMessage("Requesting short-lived terminal ticket…");
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(workspaceId)}/terminal-session`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as
        | (WorkspaceTerminalTicketDto & { message?: string })
        | null;
      if (!res.ok || !data?.token || !data?.wsUrl) {
        const msg = data?.message || "Isolated terminal unavailable.";
        setConnState("error");
        setStatusMessage(msg);
        termRef.current?.writeln(`\r\n[Rejected] ${msg}`);
        return;
      }

      wsRef.current?.close();
      const sep = data.wsUrl.includes("?") ? "&" : "?";
      const ws = new WebSocket(`${data.wsUrl}${sep}token=${encodeURIComponent(data.token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnState("connected");
        setStatusMessage(data.explanation);
        try {
          fitRef.current?.fit();
        } catch {
          // Ignore
        }
        termRef.current?.focus();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as { type?: string; data?: string; exitCode?: number };
          if (msg.type === "output" && typeof msg.data === "string") {
            termRef.current?.write(msg.data);
          } else if (msg.type === "exit") {
            termRef.current?.writeln(`\r\n[Session exited (${msg.exitCode ?? 0})]`);
            setConnState("idle");
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onerror = () => {
        setConnState("error");
        setStatusMessage("WebSocket connection to worker terminal gateway failed.");
      };

      ws.onclose = () => {
        setConnState((prev) => (prev === "connected" ? "idle" : prev));
      };
    } catch {
      setConnState("error");
      setStatusMessage("Network error while connecting to isolated terminal.");
    }
  }

  function handleDisconnect() {
    wsRef.current?.close();
    wsRef.current = null;
    setConnState("idle");
    setStatusMessage("Disconnected.");
  }

  return (
    <div className="ide-terminal-wrap">
      <div className="ide-terminal-bar">
        <div className="inline-actions" style={{ gap: ".5rem", minWidth: 0 }}>
          {!canUseTerminal && <ShieldAlert size={14} className="text-warn" />}
          <span className="truncate-text field-hint">{statusMessage}</span>
        </div>

        <div className="inline-actions" style={{ gap: ".4rem" }}>
          <Button
            type="button"
            size="compact"
            variant="secondary"
            disabled={!canUseTerminal || connState === "connecting" || connState === "connected"}
            onClick={() => void handleConnect()}
          >
            <Plug size={12} /> {connState === "connecting" ? "Connecting…" : "Connect shell"}
          </Button>
          {connState === "connected" && (
            <Button type="button" size="compact" variant="secondary" onClick={handleDisconnect}>
              <Power size={12} /> Close
            </Button>
          )}
          <Button
            type="button"
            size="compact"
            variant="secondary"
            onClick={() => termRef.current?.clear()}
          >
            <Trash2 size={12} /> Clear
          </Button>
        </div>
      </div>

      <div ref={containerRef} className="ide-xterm-host" aria-label="Workspace terminal" />
    </div>
  );
}
