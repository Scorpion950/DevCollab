"use client";

import * as Y from "yjs";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import type { CollabConnectionState, CollabRole, CollabWsTicketDto } from "@devcollab/shared";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_CONTROL = 2;

export interface RemoteCollabPeer {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  activeFilePath: string | null;
}

export interface CollabDocHandle {
  sessionId: string;
  filePath: string;
  docKey: string;
  doc: Y.Doc;
  yText: Y.Text;
  awareness: awarenessProtocol.Awareness;
  role: CollabRole;
  connectionState: CollabConnectionState;
  statusMessage: string | null;
  updateActiveFile: (activeFilePath: string | null) => void;
  destroy: () => void;
}

export interface CollabDocCallbacks {
  fetchTicket: () => Promise<CollabWsTicketDto>;
  onStateChange: (state: CollabConnectionState, message: string | null) => void;
  onRoleChange?: (role: CollabRole) => void;
  onPeersChange: (peers: RemoteCollabPeer[]) => void;
  onDocumentDeleted?: (filePath: string, message: string) => void;
  onFileEvent?: (event: { action: string; path?: string; oldPath?: string; newPath?: string }) => void;
  onTextChange?: (text: string) => void;
}

export function createCollabDocHandle(input: {
  sessionId: string;
  filePath: string;
  initialContent: string;
  initialRole: CollabRole;
  callbacks: CollabDocCallbacks;
}): CollabDocHandle {
  const doc = new Y.Doc();
  const yText = doc.getText("monaco");
  const awareness = new awarenessProtocol.Awareness(doc);

  let currentRole: CollabRole = input.initialRole;
  let connectionState: CollabConnectionState = "CONNECTING";
  let statusMessage: string | null = null;
  let ws: WebSocket | null = null;
  let destroyed = false;
  let permanentlyClosed = false;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let syncDelayedTimer: ReturnType<typeof setTimeout> | null = null;
  let docKey = "";
  let currentActiveFilePath: string | null = input.filePath;

  const setConnState = (next: CollabConnectionState, msg: string | null = null) => {
    connectionState = next;
    statusMessage = msg;
    handle.connectionState = next;
    handle.statusMessage = msg;
    input.callbacks.onStateChange(next, msg);
  };

  const emitPeers = () => {
    const peers: RemoteCollabPeer[] = [];
    for (const [clientId, state] of awareness.getStates().entries()) {
      if (clientId === doc.clientID || !state || typeof state !== "object") continue;
      const user = (state as { user?: Record<string, unknown> }).user;
      if (!user || typeof user.name !== "string") continue;
      peers.push({
        clientId,
        userId: typeof user.id === "string" ? user.id : String(clientId),
        name: user.name,
        color: typeof user.color === "string" ? user.color : "#3b82f6",
        activeFilePath: typeof user.activeFilePath === "string" ? user.activeFilePath : null,
      });
    }
    input.callbacks.onPeersChange(peers);
  };

  const sendBinary = (bytes: Uint8Array) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(bytes);
  };

  const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    input.callbacks.onTextChange?.(yText.toString());
    if (origin === "remote-sync" || origin === "server-seed") return;
    if (currentRole === "VIEWER") return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    sendBinary(encoding.toUint8Array(encoder));

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (!permanentlyClosed) {
        setConnState("SYNC_DELAYED", "Waiting for connection to sync pending local edits.");
      }
    }
  };

  const handleAwarenessUpdate = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    emitPeers();
    if (origin === "remote-awareness") return;
    const changed = [...added, ...updated, ...removed];
    if (changed.length === 0) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(awareness, changed),
    );
    sendBinary(encoding.toUint8Array(encoder));
  };

  doc.on("update", handleDocUpdate);
  awareness.on("update", handleAwarenessUpdate);

  const connectOnce = async () => {
    if (destroyed || permanentlyClosed) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setConnState("OFFLINE", "Browser offline; edits wait until network recovers.");
      scheduleReconnect();
      return;
    }

    setConnState(
      reconnectAttempts > 0 ? "RECONNECTING" : "CONNECTING",
      reconnectAttempts > 0 ? "Reconnecting collaborative stream…" : "Connecting…",
    );

    let ticket: CollabWsTicketDto;
    try {
      ticket = await input.callbacks.fetchTicket();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to authorize session.";
      if (msg.includes("PERMISSION_REVOKED") || msg.toLowerCase().includes("revoked")) {
        permanentlyClosed = true;
        setConnState("PERMISSION_REVOKED", msg);
        return;
      }
      if (msg.includes("SESSION_CLOSED") || msg.toLowerCase().includes("closed")) {
        permanentlyClosed = true;
        setConnState("SESSION_CLOSED", msg);
        return;
      }
      setConnState("RECONNECTING", msg);
      scheduleReconnect();
      return;
    }

    if (destroyed || permanentlyClosed) return;

    currentRole = ticket.role;
    handle.role = ticket.role;
    input.callbacks.onRoleChange?.(ticket.role);

    awareness.setLocalStateField("user", {
      id: ticket.user.id,
      name: ticket.user.name || ticket.user.email,
      color: ticket.colorHex,
      colorLight: `${ticket.colorHex}33`,
      activeFilePath: currentActiveFilePath,
    });

    const url = `${ticket.wsUrl}?token=${encodeURIComponent(ticket.token)}&filePath=${encodeURIComponent(input.filePath)}`;
    const socket = new WebSocket(url);
    socket.binaryType = "arraybuffer";
    ws = socket;

    if (syncDelayedTimer) clearTimeout(syncDelayedTimer);
    syncDelayedTimer = setTimeout(() => {
      if (ws === socket && socket.readyState === WebSocket.CONNECTING) {
        setConnState("SYNC_DELAYED", "Sync handshake taking longer than expected…");
      }
    }, 3500);

    socket.onopen = () => {
      if (syncDelayedTimer) {
        clearTimeout(syncDelayedTimer);
        syncDelayedTimer = null;
      }
      reconnectAttempts = 0;
      setConnState("CONNECTED", null);

      const syncEncoder = encoding.createEncoder();
      encoding.writeVarUint(syncEncoder, MSG_SYNC);
      syncProtocol.writeSyncStep1(syncEncoder, doc);
      sendBinary(encoding.toUint8Array(syncEncoder));

      if (awareness.getLocalState()) {
        const awEncoder = encoding.createEncoder();
        encoding.writeVarUint(awEncoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          awEncoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]),
        );
        sendBinary(encoding.toUint8Array(awEncoder));
      }
    };

    socket.onmessage = (evt) => {
      if (!(evt.data instanceof ArrayBuffer)) return;
      const bytes = new Uint8Array(evt.data);
      const decoder = decoding.createDecoder(bytes);
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, "remote-sync");
        if (encoding.length(encoder) > 1) {
          sendBinary(encoding.toUint8Array(encoder));
        }
        return;
      }

      if (msgType === MSG_AWARENESS) {
        const update = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(awareness, update, "remote-awareness");
        return;
      }

      if (msgType === MSG_CONTROL) {
        try {
          const ctrl = JSON.parse(decoding.readVarString(decoder)) as Record<string, unknown>;
          if (ctrl.type === "ready") {
            docKey = typeof ctrl.docKey === "string" ? ctrl.docKey : docKey;
            handle.docKey = docKey;
            if (
              ctrl.role === "OWNER" ||
              ctrl.role === "EDITOR" ||
              ctrl.role === "VIEWER"
            ) {
              currentRole = ctrl.role;
              handle.role = ctrl.role;
              input.callbacks.onRoleChange?.(ctrl.role);
            }
          } else if (ctrl.type === "role_updated") {
            const nextRole =
              ctrl.role === "OWNER" || ctrl.role === "EDITOR" || ctrl.role === "VIEWER"
                ? ctrl.role
                : null;
            if (nextRole) {
              currentRole = nextRole;
              handle.role = nextRole;
              input.callbacks.onRoleChange?.(nextRole);
            }
          } else if (ctrl.type === "permission_revoked") {
            permanentlyClosed = true;
            setConnState(
              "PERMISSION_REVOKED",
              typeof ctrl.reason === "string" ? ctrl.reason : "Your access was revoked.",
            );
          } else if (ctrl.type === "session_closed") {
            permanentlyClosed = true;
            setConnState(
              "SESSION_CLOSED",
              typeof ctrl.reason === "string" ? ctrl.reason : "Collaborative session closed.",
            );
          } else if (ctrl.type === "doc_deleted") {
            permanentlyClosed = true;
            const msg =
              typeof ctrl.message === "string"
                ? ctrl.message
                : `File ${input.filePath} was deleted.`;
            setConnState("SESSION_CLOSED", msg);
            input.callbacks.onDocumentDeleted?.(input.filePath, msg);
          } else if (ctrl.type === "file_event") {
            input.callbacks.onFileEvent?.({
              action: String(ctrl.action ?? ""),
              path: typeof ctrl.path === "string" ? ctrl.path : undefined,
              oldPath: typeof ctrl.oldPath === "string" ? ctrl.oldPath : undefined,
              newPath: typeof ctrl.newPath === "string" ? ctrl.newPath : undefined,
            });
          } else if (ctrl.type === "sync_rejected") {
            setConnState(
              "CONNECTED",
              typeof ctrl.reason === "string" ? ctrl.reason : "Edit rejected by server permissions.",
            );
          }
        } catch {
          // Ignore malformed control payload
        }
      }
    };

    socket.onclose = (ev) => {
      if (syncDelayedTimer) {
        clearTimeout(syncDelayedTimer);
        syncDelayedTimer = null;
      }
      if (destroyed || permanentlyClosed) return;
      if (ev.code === 4403) {
        permanentlyClosed = true;
        setConnState("PERMISSION_REVOKED", ev.reason || "Your access was revoked.");
        return;
      }
      if (ev.code === 4408) {
        permanentlyClosed = true;
        setConnState("SESSION_CLOSED", ev.reason || "Collaborative session was closed.");
        return;
      }
      setConnState("RECONNECTING", "Connection interrupted. Attempting recovery…");
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (destroyed || permanentlyClosed || reconnectTimer) return;
    reconnectAttempts += 1;
    const delayMs = Math.min(8000, 600 * Math.pow(1.6, Math.min(reconnectAttempts, 5)));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connectOnce();
    }, delayMs);
  };

  const handleOnline = () => {
    if (!destroyed && !permanentlyClosed && (!ws || ws.readyState !== WebSocket.OPEN)) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void connectOnce();
    }
  };
  const handleOffline = () => {
    if (!destroyed && !permanentlyClosed) {
      setConnState("OFFLINE", "Network offline.");
    }
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
  }

  const handle: CollabDocHandle = {
    sessionId: input.sessionId,
    filePath: input.filePath,
    docKey,
    doc,
    yText,
    awareness,
    role: currentRole,
    connectionState,
    statusMessage,
    updateActiveFile: (nextFile) => {
      currentActiveFilePath = nextFile;
      const prevUser = awareness.getLocalState()?.user as Record<string, unknown> | undefined;
      if (prevUser) {
        awareness.setLocalStateField("user", { ...prevUser, activeFilePath: nextFile });
      }
    },
    destroy: () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (syncDelayedTimer) clearTimeout(syncDelayedTimer);
      if (typeof window !== "undefined") {
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      }
      doc.off("update", handleDocUpdate);
      awareness.off("update", handleAwarenessUpdate);
      awareness.destroy();
      try {
        ws?.close(1000, "Tab closed");
      } catch {
        // Ignore close errors
      }
      doc.destroy();
    },
  };

  void connectOnce();
  return handle;
}
