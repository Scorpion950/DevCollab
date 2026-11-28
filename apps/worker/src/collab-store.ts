import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient } from "@devcollab/database";
import { isSensitiveOrBlockedPath, normalizeRepoRelativePath } from "@devcollab/ai-core";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import type { WorkspaceFilesystemService } from "./workspace-fs.js";

export interface CollabDocMeta {
  sessionId: string;
  pathKey: string;
  filePath: string;
  docKey: string;
  versionSeq: number;
  syncedContentSha256: string;
  deleted: boolean;
  updatedAt: string;
}

export interface CollabRoomState {
  sessionId: string;
  pathKey: string;
  filePath: string;
  docKey: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  storageKey: string;
  binPath: string;
  metaPath: string;
  versionSeq: number;
  syncedContentSha256: string;
  deleted: boolean;
  dirty: boolean;
  lastModifiedById: string | null;
  flushTimer: NodeJS.Timeout | null;
}

export type CollabControlBroadcastFn = (
  sessionId: string,
  docKey: string | null,
  payload: Record<string, unknown>,
) => void;

function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeIdSegment(raw: string): string {
  const cleaned = raw.trim().replace(/[^A-Za-z0-9_-]/g, "");
  if (!cleaned) {
    throw new Error("Invalid session identifier.");
  }
  return cleaned;
}

export function computeCollabDocKey(filePath: string): string {
  const normalized = normalizeRepoRelativePath(filePath);
  if (!normalized) {
    throw new Error(`Invalid repository file path: ${filePath}`);
  }
  return sha256Hex(normalized);
}

/**
 * Applies minimal prefix/suffix text diff inside a single Yjs transaction
 * so external disk updates (AI patches, branch switches, snapshots) merge
 * cleanly with connected clients instead of replacing the entire document.
 */
function applyMinimalStringPatchToYText(yText: Y.Text, nextText: string) {
  const currentText = yText.toString();
  if (currentText === nextText) return;

  let prefixLen = 0;
  const minLen = Math.min(currentText.length, nextText.length);
  while (prefixLen < minLen && currentText.charCodeAt(prefixLen) === nextText.charCodeAt(prefixLen)) {
    prefixLen += 1;
  }

  let suffixLen = 0;
  while (
    suffixLen < minLen - prefixLen &&
    currentText.charCodeAt(currentText.length - 1 - suffixLen) ===
      nextText.charCodeAt(nextText.length - 1 - suffixLen)
  ) {
    suffixLen += 1;
  }

  const deleteLen = currentText.length - prefixLen - suffixLen;
  const insertText = nextText.slice(prefixLen, nextText.length - suffixLen);
  if (deleteLen > 0) {
    yText.delete(prefixLen, deleteLen);
  }
  if (insertText.length > 0) {
    yText.insert(prefixLen, insertText);
  }
}

export class CollabStore {
  private readonly rooms = new Map<string, CollabRoomState>();
  private readonly pendingLoads = new Map<string, Promise<CollabRoomState>>();
  private controlBroadcaster: CollabControlBroadcastFn | null = null;

  constructor(
    private readonly snapshotRootDir: string,
    private readonly fsService: WorkspaceFilesystemService,
    private readonly prisma?: PrismaClient,
    private readonly flushDebounceMs = 350,
  ) {}

  setControlBroadcaster(fn: CollabControlBroadcastFn | null) {
    this.controlBroadcaster = fn;
  }

  private roomMapKey(sessionId: string, docKey: string): string {
    return `${sessionId}::${docKey}`;
  }

  private storagePaths(sessionId: string, docKey: string) {
    const safeSession = safeIdSegment(sessionId);
    const safeDocKey = safeIdSegment(docKey);
    const dir = path.resolve(this.snapshotRootDir, "_collab", safeSession);
    const storageKey = `_collab/${safeSession}/${safeDocKey}.bin`;
    return {
      dir,
      storageKey,
      binPath: path.join(dir, `${safeDocKey}.bin`),
      metaPath: path.join(dir, `${safeDocKey}.meta.json`),
    };
  }

  async getOrLoadRoom(input: {
    sessionId: string;
    pathKey: string;
    filePath: string;
    actorUserId?: string;
  }): Promise<CollabRoomState> {
    const normalizedPath = normalizeRepoRelativePath(input.filePath);
    if (!normalizedPath || isSensitiveOrBlockedPath(normalizedPath, true)) {
      throw new Error(`Blocked or invalid collaborative file path: ${input.filePath}`);
    }
    const docKey = computeCollabDocKey(normalizedPath);
    const key = this.roomMapKey(input.sessionId, docKey);

    const existing = this.rooms.get(key);
    if (existing) {
      if (existing.deleted) {
        throw new Error(`Document '${normalizedPath}' was deleted in this session.`);
      }
      return existing;
    }

    const inflight = this.pendingLoads.get(key);
    if (inflight) {
      return inflight;
    }

    const loadPromise = this.loadRoomInternal(
      input.sessionId,
      input.pathKey,
      normalizedPath,
      docKey,
      input.actorUserId ?? null,
    ).finally(() => {
      this.pendingLoads.delete(key);
    });

    this.pendingLoads.set(key, loadPromise);
    return loadPromise;
  }

  private async loadRoomInternal(
    sessionId: string,
    pathKey: string,
    filePath: string,
    docKey: string,
    actorUserId: string | null,
  ): Promise<CollabRoomState> {
    const key = this.roomMapKey(sessionId, docKey);
    const { dir, storageKey, binPath, metaPath } = this.storagePaths(sessionId, docKey);
    await mkdir(dir, { recursive: true });

    let meta: CollabDocMeta | null;
    try {
      const rawMeta = await readFile(metaPath, "utf8");
      meta = JSON.parse(rawMeta) as CollabDocMeta;
    } catch {
      meta = null;
    }

    if (meta?.deleted) {
      throw new Error(`Document '${filePath}' was deleted and cannot be reopened from stale state.`);
    }

    if (this.prisma) {
      const dbDoc = await this.prisma.collabDocument
        .findUnique({
          where: { sessionId_docKey: { sessionId, docKey } },
          select: { deletedAt: true },
        })
        .catch(() => null);
      if (dbDoc?.deletedAt) {
        throw new Error(`Document '${filePath}' was deleted in this session.`);
      }
    }

    const doc = new Y.Doc();
    let hasSnapshot = false;
    try {
      const bin = await readFile(binPath);
      if (bin.byteLength > 0) {
        Y.applyUpdate(doc, new Uint8Array(bin), "durable-load");
        hasSnapshot = true;
      }
    } catch {
      hasSnapshot = false;
    }

    const yText = doc.getText("monaco");
    const diskFile = await this.fsService.readFile(pathKey, filePath);
    const diskSha = diskFile.versionHash;

    if (!hasSnapshot) {
      doc.transact(() => {
        yText.insert(0, diskFile.content);
      }, "disk-seed");
    } else if (meta && meta.syncedContentSha256 !== diskSha) {
      // External workspace write (e.g. Git checkout, AI patch, snapshot restore) updated disk.
      doc.transact(() => {
        applyMinimalStringPatchToYText(yText, diskFile.content);
      }, "reconcile");
    }

    const awareness = new awarenessProtocol.Awareness(doc);
    const room: CollabRoomState = {
      sessionId,
      pathKey,
      filePath,
      docKey,
      doc,
      awareness,
      storageKey,
      binPath,
      metaPath,
      versionSeq: meta?.versionSeq ?? 1,
      syncedContentSha256: sha256Hex(yText.toString()),
      deleted: false,
      dirty: !hasSnapshot || (meta ? meta.syncedContentSha256 !== diskSha : true),
      lastModifiedById: actorUserId,
      flushTimer: null,
    };

    doc.on("update", (_update: Uint8Array, origin: unknown) => {
      if (
        origin === "durable-load" ||
        origin === "disk-seed" ||
        origin === "reconcile" ||
        origin === "server-patch"
      ) {
        return;
      }
      if (room.deleted) return;
      room.dirty = true;
      room.versionSeq += 1;
      if (origin && typeof origin === "object" && "userId" in origin) {
        const uid = (origin as { userId?: unknown }).userId;
        if (typeof uid === "string") {
          room.lastModifiedById = uid;
        }
      }
      this.scheduleRoomFlush(room);
    });

    this.rooms.set(key, room);
    if (room.dirty) {
      await this.flushRoom(room, { skipDiskWrite: false });
    }
    return room;
  }

  private scheduleRoomFlush(room: CollabRoomState) {
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
    }
    room.flushTimer = setTimeout(() => {
      room.flushTimer = null;
      void this.flushRoom(room).catch((err) => {
        console.error(`[collab-store] Debounced flush failed for ${room.filePath}:`, err);
      });
    }, this.flushDebounceMs);
    room.flushTimer.unref?.();
  }

  async flushRoom(
    room: CollabRoomState,
    opts?: { skipDiskWrite?: boolean },
  ): Promise<{ contentSha256: string; versionSeq: number }> {
    if (room.flushTimer) {
      clearTimeout(room.flushTimer);
      room.flushTimer = null;
    }

    if (room.deleted) {
      return { contentSha256: room.syncedContentSha256, versionSeq: room.versionSeq };
    }

    const text = room.doc.getText("monaco").toString();
    const contentSha = sha256Hex(text);

    if (!opts?.skipDiskWrite && contentSha !== room.syncedContentSha256) {
      await this.fsService.writeFile({
        pathKey: room.pathKey,
        path: room.filePath,
        content: text,
        skipConflictCheck: true,
      });
    }

    const encodedState = Buffer.from(Y.encodeStateAsUpdate(room.doc));
    const meta: CollabDocMeta = {
      sessionId: room.sessionId,
      pathKey: room.pathKey,
      filePath: room.filePath,
      docKey: room.docKey,
      versionSeq: room.versionSeq,
      syncedContentSha256: contentSha,
      deleted: room.deleted,
      updatedAt: new Date().toISOString(),
    };

    await mkdir(path.dirname(room.binPath), { recursive: true });
    const tmpBin = `${room.binPath}.tmp-${process.pid}-${Date.now()}`;
    const tmpMeta = `${room.metaPath}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(tmpBin, encodedState);
    await rename(tmpBin, room.binPath);
    await writeFile(tmpMeta, JSON.stringify(meta, null, 2), "utf8");
    await rename(tmpMeta, room.metaPath);

    room.syncedContentSha256 = contentSha;
    room.dirty = false;

    if (this.prisma) {
      await this.prisma.collabDocument
        .upsert({
          where: {
            sessionId_docKey: { sessionId: room.sessionId, docKey: room.docKey },
          },
          create: {
            sessionId: room.sessionId,
            filePath: room.filePath,
            docKey: room.docKey,
            storageKey: room.storageKey,
            versionSeq: room.versionSeq,
            contentSha256: contentSha,
            lastModifiedById: room.lastModifiedById,
            lastSavedAt: new Date(),
          },
          update: {
            versionSeq: room.versionSeq,
            contentSha256: contentSha,
            lastModifiedById: room.lastModifiedById,
            lastSavedAt: new Date(),
          },
        })
        .catch(() => undefined);
    }

    return { contentSha256: contentSha, versionSeq: room.versionSeq };
  }

  /**
   * Flushes all dirty collaborative documents for a workspace pathKey before Git,
   * snapshot, or patch operations run so the workspace disk state is 100% current.
   */
  async flushAllForWorkspace(pathKey: string, sessionId?: string): Promise<number> {
    let flushed = 0;
    for (const room of this.rooms.values()) {
      if (room.pathKey !== pathKey) continue;
      if (sessionId && room.sessionId !== sessionId) continue;
      if (room.deleted) continue;
      if (room.dirty || room.flushTimer) {
        await this.flushRoom(room);
        flushed += 1;
      }
    }
    return flushed;
  }

  /**
   * Reconciles active collaborative Yjs documents after workspace disk state changed
   * externally (e.g., AI patch applied, snapshot restored, Git branch switched, REST save).
   */
  async reconcileWorkspaceFilesFromDisk(
    pathKey: string,
    targetPaths?: string[],
    actorUserId?: string,
  ): Promise<void> {
    const normalizedFilter = targetPaths
      ? new Set(
          targetPaths
            .map((p) => normalizeRepoRelativePath(p))
            .filter((p): p is string => Boolean(p)),
        )
      : null;

    for (const room of this.rooms.values()) {
      if (room.pathKey !== pathKey || room.deleted) continue;
      if (normalizedFilter && !normalizedFilter.has(room.filePath)) continue;

      try {
        const diskFile = await this.fsService.readFile(pathKey, room.filePath);
        if (diskFile.versionHash === room.syncedContentSha256) continue;
        room.doc.transact(() => {
          applyMinimalStringPatchToYText(room.doc.getText("monaco"), diskFile.content);
        }, "server-patch");
        if (actorUserId) room.lastModifiedById = actorUserId;
        room.versionSeq += 1;
        room.syncedContentSha256 = sha256Hex(room.doc.getText("monaco").toString());
        await this.flushRoom(room, { skipDiskWrite: true });
      } catch {
        // File might have been deleted on branch switch or snapshot restore; mark deleted cleanly.
        await this.markFileDeletedForWorkspace(pathKey, room.filePath);
      }
    }
  }

  async markFileDeletedForWorkspace(pathKey: string, filePath: string): Promise<void> {
    const normalized = normalizeRepoRelativePath(filePath);
    if (!normalized) return;

    for (const room of this.rooms.values()) {
      if (room.pathKey !== pathKey) continue;
      if (room.filePath === normalized || room.filePath.startsWith(`${normalized}/`)) {
        if (room.flushTimer) {
          clearTimeout(room.flushTimer);
          room.flushTimer = null;
        }
        room.deleted = true;
        room.dirty = false;

        const meta: CollabDocMeta = {
          sessionId: room.sessionId,
          pathKey: room.pathKey,
          filePath: room.filePath,
          docKey: room.docKey,
          versionSeq: room.versionSeq,
          syncedContentSha256: room.syncedContentSha256,
          deleted: true,
          updatedAt: new Date().toISOString(),
        };
        await mkdir(path.dirname(room.metaPath), { recursive: true }).catch(() => undefined);
        await writeFile(room.metaPath, JSON.stringify(meta, null, 2), "utf8").catch(() => undefined);

        if (this.prisma) {
          await this.prisma.collabDocument
            .updateMany({
              where: { sessionId: room.sessionId, docKey: room.docKey },
              data: { deletedAt: new Date() },
            })
            .catch(() => undefined);
        }

        this.controlBroadcaster?.(room.sessionId, room.docKey, {
          type: "doc_deleted",
          docKey: room.docKey,
          filePath: room.filePath,
          message: `File '${room.filePath}' was deleted; collaborative document closed to prevent stale recreation.`,
        });
      }
    }
  }

  notifyFileCreatedForWorkspace(pathKey: string, filePath: string): void {
    const normalized = normalizeRepoRelativePath(filePath);
    if (!normalized) return;
    const seenSessions = new Set<string>();
    for (const room of this.rooms.values()) {
      if (room.pathKey !== pathKey || seenSessions.has(room.sessionId)) continue;
      seenSessions.add(room.sessionId);
      this.controlBroadcaster?.(room.sessionId, null, {
        type: "file_event",
        action: "create",
        path: normalized,
      });
    }
  }

  async handleFileRenameForWorkspace(
    pathKey: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    const normOld = normalizeRepoRelativePath(oldPath);
    const normNew = normalizeRepoRelativePath(newPath);
    if (!normOld || !normNew) return;

    for (const room of this.rooms.values()) {
      if (room.pathKey !== pathKey || room.deleted) continue;
      if (room.filePath === normOld || room.filePath.startsWith(`${normOld}/`)) {
        await this.flushRoom(room).catch(() => undefined);
        await this.markFileDeletedForWorkspace(pathKey, room.filePath);
        const mappedNew =
          room.filePath === normOld ? normNew : `${normNew}${room.filePath.slice(normOld.length)}`;
        this.controlBroadcaster?.(room.sessionId, null, {
          type: "file_event",
          action: "rename",
          oldPath: room.filePath,
          newPath: mappedNew,
        });
      }
    }
  }

  async closeAllRooms(): Promise<void> {
    const sessionIds = new Set<string>();
    for (const room of this.rooms.values()) {
      sessionIds.add(room.sessionId);
    }
    for (const sessionId of sessionIds) {
      await this.closeSessionRooms(sessionId);
    }
  }

  async closeSessionRooms(sessionId: string): Promise<void> {
    const targets: CollabRoomState[] = [];
    for (const room of this.rooms.values()) {
      if (room.sessionId === sessionId) {
        targets.push(room);
      }
    }
    for (const room of targets) {
      if (!room.deleted) {
        await this.flushRoom(room).catch(() => undefined);
      }
      if (room.flushTimer) {
        clearTimeout(room.flushTimer);
        room.flushTimer = null;
      }
      room.awareness.destroy();
      room.doc.destroy();
      this.rooms.delete(this.roomMapKey(room.sessionId, room.docKey));
    }
  }

  /** Test helper: unloads in-memory Y.Doc state without wiping durable .bin snapshots on disk. */
  async evictMemoryForTesting(sessionId: string): Promise<void> {
    for (const [key, room] of this.rooms.entries()) {
      if (room.sessionId !== sessionId) continue;
      if (!room.deleted) {
        await this.flushRoom(room);
      }
      if (room.flushTimer) clearTimeout(room.flushTimer);
      room.awareness.destroy();
      room.doc.destroy();
      this.rooms.delete(key);
    }
  }

  async purgeSessionStorage(sessionId: string): Promise<void> {
    await this.closeSessionRooms(sessionId);
    const dir = path.resolve(this.snapshotRootDir, "_collab", safeIdSegment(sessionId));
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
