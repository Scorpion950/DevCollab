"use client";

import { useState, type KeyboardEvent } from "react";
import {
  LogOut,
  MessageSquare,
  Send,
  ShieldAlert,
  UserPlus,
  Users,
  XCircle,
} from "lucide-react";
import type {
  CollabConnectionState,
  CollabSessionDetailDto,
  CollabSessionSummaryDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import type { RemoteCollabPeer } from "./collab-client";
import { formatDateTime } from "../task-badges";

function connectionBadgeClass(state: CollabConnectionState): string {
  switch (state) {
    case "CONNECTED":
      return "badge badge-accent";
    case "CONNECTING":
    case "RECONNECTING":
    case "SYNC_DELAYED":
      return "badge badge-progress";
    case "PERMISSION_REVOKED":
    case "SESSION_CLOSED":
      return "badge priority-urgent";
    default:
      return "badge";
  }
}

function connectionLabel(state: CollabConnectionState): string {
  switch (state) {
    case "IDLE":
      return "Solo mode";
    case "CONNECTING":
      return "Connecting";
    case "CONNECTED":
      return "Connected";
    case "RECONNECTING":
      return "Reconnecting";
    case "OFFLINE":
      return "Offline";
    case "SYNC_DELAYED":
      return "Sync Delayed";
    case "PERMISSION_REVOKED":
      return "Permission Revoked";
    case "SESSION_CLOSED":
      return "Session Closed";
  }
}

export function IdeCollabPanel({
  activeSession,
  sessions,
  remotePeers,
  connectionState,
  connectionMessage,
  activeFilePath,
  canStartSession,
  busy,
  onStartSession,
  onSelectSession,
  onJoinSession,
  onLeaveSession,
  onCloseSession,
  onInviteParticipant,
  onUpdateRole,
  onRevokeParticipant,
  onSendMessage,
  onOpenFilePath,
}: {
  activeSession: CollabSessionDetailDto | null;
  sessions: CollabSessionSummaryDto[];
  remotePeers: RemoteCollabPeer[];
  connectionState: CollabConnectionState;
  connectionMessage: string | null;
  activeFilePath: string | null;
  canStartSession: boolean;
  busy: boolean;
  onStartSession: (inviteeIds: string[]) => Promise<void>;
  onSelectSession: (sessionId: string) => Promise<void>;
  onJoinSession: (sessionId: string) => Promise<void>;
  onLeaveSession: (sessionId: string) => Promise<void>;
  onCloseSession: (sessionId: string) => Promise<void>;
  onInviteParticipant: (userId: string, role: "EDITOR" | "VIEWER") => Promise<void>;
  onUpdateRole: (userId: string, role: "EDITOR" | "VIEWER") => Promise<void>;
  onRevokeParticipant: (userId: string) => Promise<void>;
  onSendMessage: (body: string, filePath: string | null) => Promise<void>;
  onOpenFilePath: (filePath: string) => void;
}) {
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [chatText, setChatText] = useState("");
  const [attachActiveFile, setAttachActiveFile] = useState(true);
  const [sendingMsg, setSendingMsg] = useState(false);

  const peerByUserId = new Map<string, RemoteCollabPeer>();
  for (const peer of remotePeers) {
    peerByUserId.set(peer.userId, peer);
  }

  const isOwner = activeSession?.myRole === "OWNER";

  const handleSubmitChat = async () => {
    const trimmed = chatText.trim();
    if (!trimmed || !activeSession || sendingMsg) return;
    setSendingMsg(true);
    try {
      await onSendMessage(trimmed, attachActiveFile ? activeFilePath : null);
      setChatText("");
    } finally {
      setSendingMsg(false);
    }
  };

  const handleChatKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmitChat();
    } else if (e.key === "Escape") {
      setChatText("");
    }
  };

  return (
    <div className="form-stack" style={{ gap: ".85rem" }}>
      <section className="app-card">
        <div className="app-card-header">
          <h2 className="inline-actions" style={{ fontSize: ".95rem" }}>
            <Users size={15} /> Live Collaboration
          </h2>
          <span className={connectionBadgeClass(connectionState)}>
            {connectionLabel(connectionState)}
          </span>
        </div>

        {connectionMessage && (
          <div
            className={`banner ${
              connectionState === "PERMISSION_REVOKED" || connectionState === "SESSION_CLOSED"
                ? "banner-error"
                : "banner-neutral"
            }`}
            style={{ fontSize: ".78rem", marginBottom: ".55rem" }}
          >
            <ShieldAlert size={14} />
            <span>{connectionMessage}</span>
          </div>
        )}

        {!activeSession ? (
          <div className="form-stack" style={{ gap: ".55rem" }}>
            <p className="field-hint" style={{ margin: 0 }}>
              Sessions are private by default. Start live collaboration to edit files together with
              authorized project teammates via CRDT sync.
            </p>
            {canStartSession && (
              <Button
                type="button"
                size="compact"
                disabled={busy}
                onClick={() => void onStartSession([])}
              >
                <Users size={13} /> Start Collaboration Session
              </Button>
            )}

            {sessions.length > 0 && (
              <div className="form-stack" style={{ gap: ".4rem", marginTop: ".35rem" }}>
                <span className="field-hint">Shared sessions in this project:</span>
                {sessions.map((s) => (
                  <div key={s.id} className="ide-proposal-card">
                    <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                      <strong style={{ fontSize: ".83rem" }}>{s.title}</strong>
                      <span className="badge">{s.status.toLowerCase()}</span>
                    </div>
                    <small className="field-hint">
                      {s.workspaceName} · {s.participantCount} active · Role:{" "}
                      {(s.myRole ?? "VIEWER").toLowerCase()}
                    </small>
                    <div className="inline-actions" style={{ gap: ".35rem" }}>
                      {s.status === "ACTIVE" && s.myStatus !== "REMOVED" ? (
                        <Button
                          type="button"
                          size="compact"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            void (s.myStatus === "ACTIVE"
                              ? onSelectSession(s.id)
                              : onJoinSession(s.id))
                          }
                        >
                          {s.myStatus === "ACTIVE" ? "Attach Session" : "Join Session"}
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="compact"
                          variant="secondary"
                          onClick={() => void onSelectSession(s.id)}
                        >
                          View History
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="form-stack" style={{ gap: ".6rem" }}>
            <div className="inline-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <strong style={{ fontSize: ".88rem" }}>{activeSession.title}</strong>
                <div className="field-hint" style={{ fontSize: ".75rem" }}>
                  Role: <strong>{activeSession.myRole}</strong> · Status: {activeSession.status}
                </div>
              </div>
              <div className="inline-actions" style={{ gap: ".35rem" }}>
                {activeSession.status === "ACTIVE" && !isOwner && (
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onLeaveSession(activeSession.id)}
                  >
                    <LogOut size={12} /> Leave
                  </Button>
                )}
                {activeSession.status === "ACTIVE" && isOwner && (
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => void onCloseSession(activeSession.id)}
                  >
                    <XCircle size={12} /> Close Session
                  </Button>
                )}
              </div>
            </div>

            {isOwner && activeSession.status === "ACTIVE" && (
              <form
                className="inline-actions"
                style={{ gap: ".35rem", flexWrap: "wrap" }}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!inviteUserId) return;
                  void onInviteParticipant(inviteUserId, inviteRole).then(() => setInviteUserId(""));
                }}
              >
                <select
                  aria-label="Select project teammate to invite"
                  className="field-select"
                  style={{ flex: "1 1 130px", minWidth: 0 }}
                  value={inviteUserId}
                  onChange={(e) => setInviteUserId(e.target.value)}
                >
                  <option value="">Invite teammate…</option>
                  {activeSession.eligibleInvitees
                    .filter(
                      (u) =>
                        !activeSession.participants.some(
                          (p) => p.userId === u.id && p.status === "ACTIVE",
                        ),
                    )
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email}
                      </option>
                    ))}
                </select>
                <select
                  aria-label="Invitee collaboration role"
                  className="field-select"
                  style={{ width: "86px" }}
                  value={inviteRole}
                  onChange={(e) =>
                    setInviteRole(e.target.value === "VIEWER" ? "VIEWER" : "EDITOR")
                  }
                >
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
                <Button type="submit" size="compact" disabled={busy || !inviteUserId}>
                  <UserPlus size={12} /> Invite
                </Button>
              </form>
            )}

            <ul className="collab-participant-list">
              {activeSession.participants.map((p) => {
                const live = peerByUserId.get(p.userId);
                return (
                  <li key={p.id} className="collab-participant-row">
                    <div className="inline-actions" style={{ gap: ".45rem", minWidth: 0 }}>
                      <span
                        className="collab-dot"
                        style={{ backgroundColor: p.colorHex }}
                        aria-hidden="true"
                      />
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: ".8rem",
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {p.user.name || p.user.email}
                        </div>
                        <small className="field-hint" style={{ fontSize: ".7rem" }}>
                          {p.role.toLowerCase()} · {p.status.toLowerCase()}
                          {live?.activeFilePath ? ` · ${live.activeFilePath}` : ""}
                        </small>
                      </div>
                    </div>

                    {isOwner && activeSession.status === "ACTIVE" && p.role !== "OWNER" && p.status === "ACTIVE" && (
                      <div className="inline-actions" style={{ gap: ".25rem" }}>
                        <select
                          aria-label={`Role for ${p.user.name || p.user.email}`}
                          className="field-select"
                          style={{ fontSize: ".72rem", padding: ".15rem .35rem" }}
                          value={p.role}
                          onChange={(e) =>
                            void onUpdateRole(
                              p.userId,
                              e.target.value === "VIEWER" ? "VIEWER" : "EDITOR",
                            )
                          }
                        >
                          <option value="EDITOR">Editor</option>
                          <option value="VIEWER">Viewer</option>
                        </select>
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="Revoke access"
                          aria-label={`Remove ${p.user.name || p.user.email}`}
                          onClick={() => void onRevokeParticipant(p.userId)}
                        >
                          <XCircle size={13} />
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {activeSession && (
        <section className="app-card" aria-labelledby="collab-discussion-heading">
          <div className="app-card-header">
            <h2 id="collab-discussion-heading" className="inline-actions" style={{ fontSize: ".92rem" }}>
              <MessageSquare size={14} /> Session Discussion ({activeSession.messages.length})
            </h2>
          </div>

          <div className="collab-chat-feed">
            {activeSession.messages.length === 0 ? (
              <p className="field-hint" style={{ fontSize: ".78rem", margin: 0 }}>
                No messages yet. Coordinate file changes or review context with session members.
              </p>
            ) : (
              activeSession.messages.map((m) => (
                <div key={m.id} className="collab-chat-msg">
                  <div className="inline-actions" style={{ justifyContent: "space-between", fontSize: ".72rem" }}>
                    <strong>{m.author?.name || m.author?.email || "Member"}</strong>
                    <span className="field-hint">{formatDateTime(m.createdAt)}</span>
                  </div>
                  <p style={{ margin: ".2rem 0", fontSize: ".81rem", whiteSpace: "pre-wrap" }}>{m.body}</p>
                  {m.filePath && (
                    <button
                      type="button"
                      className="text-action-link"
                      style={{ fontSize: ".72rem" }}
                      onClick={() => onOpenFilePath(m.filePath!)}
                    >
                      {m.filePath}
                      {m.lineNumber ? `:${m.lineNumber}` : ""}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {activeSession.status === "ACTIVE" && activeSession.myStatus === "ACTIVE" && (
            <div className="form-stack" style={{ gap: ".4rem", marginTop: ".5rem" }}>
              <textarea
                className="field-input"
                rows={2}
                placeholder="Discuss this session (Enter to send, Shift+Enter newline)…"
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={handleChatKeyDown}
                maxLength={2000}
              />
              <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                <label className="field-hint inline-actions" style={{ gap: ".3rem", fontSize: ".73rem" }}>
                  <input
                    type="checkbox"
                    checked={attachActiveFile}
                    onChange={(e) => setAttachActiveFile(e.target.checked)}
                    disabled={!activeFilePath}
                  />
                  {activeFilePath ? `Ref ${activeFilePath}` : "No file open"}
                </label>
                <Button
                  type="button"
                  size="compact"
                  disabled={sendingMsg || !chatText.trim()}
                  onClick={() => void handleSubmitChat()}
                >
                  <Send size={12} /> Send
                </Button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
