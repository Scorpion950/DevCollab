import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { PrismaClient } from "@devcollab/database";
import { isSensitiveOrBlockedPath, normalizeRepoRelativePath } from "@devcollab/ai-core";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import { WebSocketServer, type WebSocket } from "ws";
import type { CollabRole } from "@devcollab/shared";
import type { WorkerConfig } from "./config.js";
import { verifyHs256Jwt } from "./jwt.js";
import type { CollabRoomState, CollabStore } from "./collab-store.js";

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const MSG_CONTROL = 2;

const MAX_COLLAB_FRAME_BYTES = 1024 * 1024; // 1 MB max per binary update
const MAX_MESSAGES_PER_WINDOW = 240;
const RATE_WINDOW_MS = 2_000;

interface CollabClientConnection {
  ws: WebSocket;
  userId: string;
  sessionId: string;
  workspaceId: string;
  pathKey: string;
  docKey: string;
  filePath: string;
  role: CollabRole;
  room: CollabRoomState;
  controlledAwarenessIds: Set<number>;
  windowStartedAt: number;
  windowCount: number;
  closed: boolean;
}

export class CollabGateway {
  private readonly wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_COLLAB_FRAME_BYTES,
  });
  private readonly clientsByRoom = new Map<string, Set<CollabClientConnection>>();
  private readonly roomListenersAttached = new Set<string>();

  constructor(
    private readonly config: WorkerConfig,
    private readonly store: CollabStore,
    private readonly prisma?: PrismaClient,
  ) {
    this.store.setControlBroadcaster((sessionId, docKey, payload) => {
      this.broadcastControl(sessionId, docKey, payload);
    });
  }

  private roomKey(sessionId: string, docKey: string): string {
    return `${sessionId}::${docKey}`;
  }

  private rejectUpgrade(socket: Duplex, statusCode: number, message: string) {
    try {
      socket.write(
        `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(message)}\r\n\r\n${message}`,
      );
    } catch {
      // Ignore write error on dead socket
    }
    socket.destroy();
  }

  private sendBinary(ws: WebSocket, bytes: Uint8Array) {
    if (ws.readyState !== 1) return;
    ws.send(bytes, { binary: true });
  }

  private sendControl(ws: WebSocket, payload: Record<string, unknown>) {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_CONTROL);
    encoding.writeVarString(encoder, JSON.stringify(payload));
    this.sendBinary(ws, encoding.toUint8Array(encoder));
  }

  broadcastControl(sessionId: string, docKey: string | null, payload: Record<string, unknown>) {
    for (const [key, clients] of this.clientsByRoom.entries()) {
      if (!key.startsWith(`${sessionId}::`)) continue;
      if (docKey && key !== this.roomKey(sessionId, docKey)) continue;
      for (const client of clients) {
        this.sendControl(client.ws, payload);
      }
    }
  }

  invalidateParticipant(sessionId: string, userId: string, reason = "Your session access was revoked.") {
    for (const [key, clients] of this.clientsByRoom.entries()) {
      if (!key.startsWith(`${sessionId}::`)) continue;
      for (const client of Array.from(clients)) {
        if (client.userId !== userId) continue;
        this.sendControl(client.ws, {
          type: "permission_revoked",
          reason,
        });
        try {
          client.ws.close(4403, reason.slice(0, 110));
        } catch {
          client.ws.terminate();
        }
      }
    }
  }

  updateParticipantRole(sessionId: string, userId: string, newRole: CollabRole) {
    for (const [key, clients] of this.clientsByRoom.entries()) {
      if (!key.startsWith(`${sessionId}::`)) continue;
      for (const client of clients) {
        if (client.userId !== userId) continue;
        client.role = newRole;
        this.sendControl(client.ws, {
          type: "role_updated",
          role: newRole,
        });
      }
    }
  }

  async closeSession(sessionId: string, reason = "Collaborative session was closed.") {
    for (const [key, clients] of this.clientsByRoom.entries()) {
      if (!key.startsWith(`${sessionId}::`)) continue;
      for (const client of Array.from(clients)) {
        this.sendControl(client.ws, {
          type: "session_closed",
          reason,
        });
        try {
          client.ws.close(4408, reason.slice(0, 110));
        } catch {
          client.ws.terminate();
        }
      }
    }
    await this.store.closeSessionRooms(sessionId);
  }

  async handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
    const reqUrl = new URL(request.url ?? "/", "http://localhost");
    if (reqUrl.pathname !== "/collab") {
      this.rejectUpgrade(socket, 404, "Not Found");
      return;
    }

    const origin = request.headers.origin?.replace(/\/$/, "");
    if (origin && !this.config.terminalAllowedOrigins.includes(origin)) {
      this.rejectUpgrade(socket, 403, "Forbidden Origin");
      return;
    }

    const secret = this.config.internalAuthSecret;
    if (!secret || secret.length < 32) {
      this.rejectUpgrade(socket, 503, "Collaboration Authentication Misconfigured");
      return;
    }

    const token = reqUrl.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      this.rejectUpgrade(socket, 401, "Collaboration Ticket Required");
      return;
    }

    let claims: ReturnType<typeof verifyHs256Jwt>;
    try {
      claims = verifyHs256Jwt(token, secret, {
        iss: "devcollab-api",
        aud: "devcollab-worker-collab",
      });
    } catch {
      this.rejectUpgrade(socket, 401, "Invalid or Expired Collaboration Ticket");
      return;
    }

    const userId = typeof claims.sub === "string" ? claims.sub : "";
    const sessionId = typeof claims.sessionId === "string" ? claims.sessionId : "";
    const workspaceId = typeof claims.workspaceId === "string" ? claims.workspaceId : "";
    const pathKey = typeof claims.pathKey === "string" ? claims.pathKey : "";
    const tokenRole = claims.role;
    const rawFilePath = reqUrl.searchParams.get("filePath")?.trim() ?? "";
    const normalizedFilePath = normalizeRepoRelativePath(rawFilePath);

    if (
      !userId ||
      !sessionId ||
      !workspaceId ||
      !pathKey ||
      !normalizedFilePath ||
      isSensitiveOrBlockedPath(normalizedFilePath, true) ||
      (tokenRole !== "OWNER" && tokenRole !== "EDITOR" && tokenRole !== "VIEWER")
    ) {
      this.rejectUpgrade(socket, 400, "Invalid Collaboration Scope");
      return;
    }

    // Re-check live DB membership & session status on upgrade when DB is attached
    // so revoked participants or closed sessions cannot reuse a non-expired ticket.
    let verifiedRole: CollabRole = tokenRole;
    if (this.prisma) {
      const session = await this.prisma.collabSession
        .findUnique({
          where: { id: sessionId },
          include: {
            participants: {
              where: { userId },
              take: 1,
            },
          },
        })
        .catch(() => null);

      if (!session || session.status !== "ACTIVE" || session.workspaceId !== workspaceId) {
        this.rejectUpgrade(socket, 403, "Session Closed or Inactive");
        return;
      }
      const participant = session.participants[0];
      if (!participant || participant.status !== "ACTIVE") {
        this.rejectUpgrade(socket, 403, "Participant Access Revoked");
        return;
      }
      verifiedRole = participant.role as CollabRole;
    }

    let room: CollabRoomState;
    try {
      room = await this.store.getOrLoadRoom({
        sessionId,
        pathKey,
        filePath: normalizedFilePath,
        actorUserId: userId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Document unavailable";
      this.rejectUpgrade(socket, 409, message.slice(0, 90));
      return;
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.attachClient(ws, {
        userId,
        sessionId,
        workspaceId,
        pathKey,
        docKey: room.docKey,
        filePath: room.filePath,
        role: verifiedRole,
        room,
      });
    });
  }

  private ensureRoomListeners(room: CollabRoomState) {
    const rKey = this.roomKey(room.sessionId, room.docKey);
    if (this.roomListenersAttached.has(rKey)) return;
    this.roomListenersAttached.add(rKey);

    room.doc.on("update", (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const encoded = encoding.toUint8Array(encoder);

      const clients = this.clientsByRoom.get(rKey);
      if (!clients) return;
      for (const client of clients) {
        if (origin && typeof origin === "object" && "ws" in origin && origin.ws === client.ws) {
          continue;
        }
        this.sendBinary(client.ws, encoded);
      }
    });

    room.awareness.on(
      "update",
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        const changedClients = [...added, ...updated, ...removed];
        if (changedClients.length === 0) return;

        if (origin && typeof origin === "object" && "controlledAwarenessIds" in origin) {
          const sourceClient = origin as CollabClientConnection;
          for (const id of added) sourceClient.controlledAwarenessIds.add(id);
          for (const id of removed) sourceClient.controlledAwarenessIds.delete(id);
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients),
        );
        const encoded = encoding.toUint8Array(encoder);

        const clients = this.clientsByRoom.get(rKey);
        if (!clients) return;
        for (const client of clients) {
          if (origin === client) continue;
          this.sendBinary(client.ws, encoded);
        }
      },
    );
  }

  private attachClient(
    ws: WebSocket,
    info: {
      userId: string;
      sessionId: string;
      workspaceId: string;
      pathKey: string;
      docKey: string;
      filePath: string;
      role: CollabRole;
      room: CollabRoomState;
    },
  ) {
    const rKey = this.roomKey(info.sessionId, info.docKey);
    let roomClients = this.clientsByRoom.get(rKey);
    if (!roomClients) {
      roomClients = new Set();
      this.clientsByRoom.set(rKey, roomClients);
    }

    this.ensureRoomListeners(info.room);

    const client: CollabClientConnection = {
      ws,
      ...info,
      controlledAwarenessIds: new Set(),
      windowStartedAt: Date.now(),
      windowCount: 0,
      closed: false,
    };
    roomClients.add(client);

    // 1. Send initial Sync Step 1 so client syncs both ways
    const step1Encoder = encoding.createEncoder();
    encoding.writeVarUint(step1Encoder, MSG_SYNC);
    syncProtocol.writeSyncStep1(step1Encoder, info.room.doc);
    this.sendBinary(ws, encoding.toUint8Array(step1Encoder));

    // 2. Send current ephemeral awareness states of active collaborators
    const awarenessStates = info.room.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          info.room.awareness,
          Array.from(awarenessStates.keys()),
        ),
      );
      this.sendBinary(ws, encoding.toUint8Array(awarenessEncoder));
    }

    // 3. Send ready control frame
    this.sendControl(ws, {
      type: "ready",
      sessionId: client.sessionId,
      filePath: client.filePath,
      docKey: client.docKey,
      role: client.role,
    });

    ws.on("message", (rawData, isBinary) => {
      if (client.closed) return;
      if (!isBinary) {
        this.sendControl(ws, { type: "error", message: "Binary collaboration protocol required." });
        return;
      }

      const buf = Buffer.isBuffer(rawData)
        ? rawData
        : Array.isArray(rawData)
          ? Buffer.concat(rawData)
          : Buffer.from(rawData);

      if (buf.byteLength === 0 || buf.byteLength > MAX_COLLAB_FRAME_BYTES) {
        ws.close(4413, "Collaboration frame exceeds maximum size.");
        return;
      }

      const now = Date.now();
      if (now - client.windowStartedAt > RATE_WINDOW_MS) {
        client.windowStartedAt = now;
        client.windowCount = 0;
      }
      client.windowCount += 1;
      if (client.windowCount > MAX_MESSAGES_PER_WINDOW) {
        ws.close(4429, "Collaboration message rate limit exceeded.");
        return;
      }

      try {
        this.handleIncomingFrame(client, new Uint8Array(buf));
      } catch {
        this.sendControl(ws, {
          type: "sync_rejected",
          reason: "Malformed collaborative synchronization payload.",
        });
      }
    });

    ws.on("close", () => {
      client.closed = true;
      roomClients?.delete(client);
      if (roomClients && roomClients.size === 0) {
        this.clientsByRoom.delete(rKey);
      }
      if (client.controlledAwarenessIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          client.room.awareness,
          Array.from(client.controlledAwarenessIds),
          "disconnect",
        );
      }
    });

    ws.on("error", () => {
      client.closed = true;
    });
  }

  private handleIncomingFrame(client: CollabClientConnection, payload: Uint8Array) {
    const decoder = decoding.createDecoder(payload);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MSG_SYNC) {
      if (client.room.deleted) {
        this.sendControl(client.ws, {
          type: "doc_deleted",
          docKey: client.docKey,
          filePath: client.filePath,
          message: "Document was deleted; edits cannot be applied.",
        });
        return;
      }

      // Inspect sync subtype cleanly without consuming encoder prematurely:
      // 0 = SyncStep1 (read state vector -> respond with SyncStep2)
      // 1 = SyncStep2 (incoming update from client!)
      // 2 = Update (incremental CRDT update from client!)
      const peekDecoder = decoding.createDecoder(payload);
      decoding.readVarUint(peekDecoder); // MSG_SYNC
      const syncSubType = decoding.readVarUint(peekDecoder);

      const isMutatingSync = syncSubType === syncProtocol.messageYjsSyncStep2 || syncSubType === syncProtocol.messageYjsUpdate;
      if (isMutatingSync && client.role === "VIEWER") {
        // Viewers must NEVER be able to mutate server Y.Doc or broadcast updates.
        if (syncSubType === syncProtocol.messageYjsUpdate) {
          this.sendControl(client.ws, {
            type: "sync_rejected",
            reason: "Read-only viewer role cannot modify collaborative files.",
          });
        }
        return;
      }

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, client.room.doc, {
        ws: client.ws,
        userId: client.userId,
      });

      if (encoding.length(encoder) > 1) {
        this.sendBinary(client.ws, encoding.toUint8Array(encoder));
      }
      return;
    }

    if (messageType === MSG_AWARENESS) {
      const updateBytes = decoding.readVarUint8Array(decoder);
      awarenessProtocol.applyAwarenessUpdate(client.room.awareness, updateBytes, client);
      return;
    }

    throw new Error("Unsupported collaborative message channel.");
  }

  closeAll() {
    for (const clients of this.clientsByRoom.values()) {
      for (const client of Array.from(clients)) {
        try {
          client.ws.close(1001, "Worker shutting down.");
          setTimeout(() => {
            try {
              client.ws.terminate();
            } catch {
              // Ignore
            }
          }, 50).unref();
        } catch {
          client.ws.terminate();
        }
      }
    }
    this.clientsByRoom.clear();
    try {
      this.wss.close();
    } catch {
      // Ignore
    }
  }
}
