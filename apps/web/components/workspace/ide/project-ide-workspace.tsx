"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Bot,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Code2,
  FileCode2,
  FilePlus,
  Files,
  Folder,
  FolderOpen,
  FolderPlus,
  GitBranch,
  GitCommitHorizontal,
  GitCompare,
  HardDrive,
  Loader2,
  Menu,
  Minus,
  PanelBottom,
  PanelRight,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Square,
  TerminalSquare,
  Trash2,
  Users,
  WrapText,
  X,
} from "lucide-react";
import type {
  AiInlineActionKind,
  CollabConnectionState,
  CollabSessionDetailDto,
  CollabSessionSummaryDto,
  CollabWsTicketDto,
  DevWorkspaceDto,
  DevWorkspaceStatus,
  ProjectIdeOverviewDto,
  PullRequestChangedFileDto,
  WorkspaceFileContentDto,
  WorkspaceGitStatusDto,
  WorkspaceRuntimeCapabilitiesDto,
  WorkspaceSearchMatchDto,
  WorkspaceTreeEntryDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { CodeDiffViewer } from "../code-diff-viewer";
import { ConfirmDialog } from "../confirm-dialog";
import { formatDateTime, TaskPriorityBadge, TaskStatusBadge } from "../task-badges";
import {
  createCollabDocHandle,
  type CollabDocHandle,
  type RemoteCollabPeer,
} from "./collab-client";
import { IdeAiAssistantPanel } from "./ide-ai-assistant-panel";
import { IdeCollabPanel } from "./ide-collab-panel";
import type { EditorSelectionRange } from "./monaco-code-editor";

const DynamicMonacoEditor = dynamic(
  () => import("./monaco-code-editor").then((m) => m.MonacoCodeEditor),
  {
    ssr: false,
    loading: () => <div className="ide-editor-placeholder">Loading Monaco editor…</div>,
  },
);

const DynamicXtermTerminal = dynamic(
  () => import("./xterm-terminal").then((m) => m.XtermTerminal),
  {
    ssr: false,
    loading: () => <div className="ide-editor-placeholder">Loading terminal…</div>,
  },
);

type FileTab = {
  kind: "file";
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  versionHash: string;
  size: number;
  isBinary: boolean;
  isTooLarge: boolean;
  language: string;
  dirty: boolean;
  saving: boolean;
  conflictMessage: string | null;
};

type DiffTab = {
  kind: "diff";
  id: string;
  title: string;
  badgeText: string;
  files: PullRequestChangedFileDto[];
};

type EditorTab = FileTab | DiffTab;

function workspaceStatusBadge(status: DevWorkspaceStatus) {
  switch (status) {
    case "ACTIVE":
    case "READY":
      return "badge badge-accent";
    case "CREATING":
      return "badge badge-progress";
    case "SUSPENDED":
    case "STOPPED":
      return "badge badge-warm";
    case "FAILED":
    case "EXPIRED":
      return "badge priority-urgent";
  }
}

export function ProjectIdeWorkspace({
  projectId,
  initialOverview,
  initialWorkspaceId,
  initialTaskId,
  initialProposalId,
}: {
  projectId: string;
  initialOverview: ProjectIdeOverviewDto;
  initialWorkspaceId: string | null;
  initialTaskId: string | null;
  initialProposalId: string | null;
}) {
  const [capabilities, setCapabilities] = useState<WorkspaceRuntimeCapabilitiesDto>(
    initialOverview.capabilities,
  );
  const [workspaces, setWorkspaces] = useState<DevWorkspaceDto[]>(initialOverview.workspaces);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>(
    (initialWorkspaceId && initialOverview.workspaces.some((w) => w.id === initialWorkspaceId)
      ? initialWorkspaceId
      : initialOverview.workspaces[0]?.id) ?? "",
  );

  // Create workspace controls
  const [newWsOpen, setNewWsOpen] = useState(initialOverview.workspaces.length === 0);
  const [newWsName, setNewWsName] = useState("");
  const [newWsBranch, setNewWsBranch] = useState(
    initialOverview.project.repositorySummary?.defaultBranch ?? "main",
  );
  const [newWsTaskId, setNewWsTaskId] = useState(initialTaskId ?? "");
  const [creatingWs, setCreatingWs] = useState(false);

  // Explorer, Search, Git
  const [leftTab, setLeftTab] = useState<"explorer" | "search" | "git">("explorer");
  const [treeEntries, setTreeEntries] = useState<WorkspaceTreeEntryDto[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, boolean>>({});
  const [mobileExplorerOpen, setMobileExplorerOpen] = useState(false);

  // File operation dialog/forms
  const [fsDialog, setFsDialog] = useState<{
    mode: "create-file" | "create-folder" | "rename";
    targetPath: string;
    value: string;
  } | null>(null);
  const [fsBusy, setFsBusy] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"files" | "text">("files");
  const [searchResults, setSearchResults] = useState<WorkspaceSearchMatchDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchActiveIdx, setSearchActiveIdx] = useState(0);

  // Git
  const [gitStatus, setGitStatus] = useState<WorkspaceGitStatusDto | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [gitBusy, setGitBusy] = useState(false);

  // Editor tabs & preferences
  const [tabs, setTabs] = useState<EditorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>("");
  const [wordWrap, setWordWrap] = useState<"on" | "off">("off");
  const [tabSize, setTabSize] = useState<2 | 4>(2);

  // Layout panels & resizable sizes
  const [leftWidth, setLeftWidth] = useState(275);
  const [rightWidth, setRightWidth] = useState(340);
  const [bottomHeight, setBottomHeight] = useState(235);
  const [showBottom, setShowBottom] = useState(true);
  const [bottomTab, setBottomTab] = useState<"terminal" | "output">("terminal");
  const [showRightPanel, setShowRightPanel] = useState(
    Boolean(initialTaskId || initialProposalId || initialOverview.proposals.length > 0),
  );
  const [rightTab, setRightTab] = useState<"assistant" | "collab" | "context">(
    initialProposalId ? "context" : "assistant",
  );

  // Brick 8: Collaboration session & AI assistant IDE state
  const [collabSessions, setCollabSessions] = useState<CollabSessionSummaryDto[]>([]);
  const [activeCollabSession, setActiveCollabSession] = useState<CollabSessionDetailDto | null>(null);
  const [collabBusy, setCollabBusy] = useState(false);
  const [collabConnState, setCollabConnState] = useState<CollabConnectionState>("IDLE");
  const [collabConnMessage, setCollabConnMessage] = useState<string | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemoteCollabPeer[]>([]);
  const [activeDocHandle, setActiveDocHandle] = useState<CollabDocHandle | null>(null);
  const [activeDocKey, setActiveDocKey] = useState<string>("");
  const collabHandlesRef = useRef<Map<string, CollabDocHandle>>(new Map());
  const tabsRef = useRef<EditorTab[]>(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  const [editorSelection, setEditorSelection] = useState<EditorSelectionRange | null>(null);
  const [pendingInlineAction, setPendingInlineAction] = useState<{
    kind: AiInlineActionKind;
    selection: EditorSelectionRange;
    seq: number;
  } | null>(null);
  const [revealLine, setRevealLine] = useState<{ line: number; seq: number } | null>(null);

  // Confirmations & Feedback
  const [confirmState, setConfirmState] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    danger?: boolean;
    run: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [patchBusyId, setPatchBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedWorkspaceId) ?? null,
    [workspaces, selectedWorkspaceId],
  );
  const activeTab = useMemo(
    () => tabs.find((t) => t.id === activeTabId) ?? null,
    [tabs, activeTabId],
  );
  const activeTask = useMemo(() => {
    const tid = selectedWorkspace?.taskId || initialTaskId;
    if (!tid) return null;
    return initialOverview.tasks.find((t) => t.id === tid) ?? null;
  }, [initialOverview.tasks, initialTaskId, selectedWorkspace?.taskId]);

  const highlightedProposal = useMemo(() => {
    if (!initialProposalId) return null;
    return initialOverview.proposals.find((p) => p.proposal.id === initialProposalId) ?? null;
  }, [initialOverview.proposals, initialProposalId]);

  // Persist session panel sizes safely
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`devcollab.ide.layout.${projectId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as {
          leftWidth?: number;
          rightWidth?: number;
          bottomHeight?: number;
          showRightPanel?: boolean;
          showBottom?: boolean;
        };
        if (typeof parsed.leftWidth === "number") setLeftWidth(Math.min(440, Math.max(200, parsed.leftWidth)));
        if (typeof parsed.rightWidth === "number") setRightWidth(Math.min(500, Math.max(240, parsed.rightWidth)));
        if (typeof parsed.bottomHeight === "number") setBottomHeight(Math.min(420, Math.max(140, parsed.bottomHeight)));
        if (typeof parsed.showRightPanel === "boolean" && !initialProposalId) {
          setShowRightPanel(parsed.showRightPanel);
        }
        if (typeof parsed.showBottom === "boolean") setShowBottom(parsed.showBottom);
      }
    } catch {
      // Ignore sessionStorage unavailable
    }
  }, [projectId, initialProposalId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        `devcollab.ide.layout.${projectId}`,
        JSON.stringify({ leftWidth, rightWidth, bottomHeight, showRightPanel, showBottom }),
      );
    } catch {
      // Ignore
    }
  }, [projectId, leftWidth, rightWidth, bottomHeight, showRightPanel, showBottom]);

  // Warn before unloading with unsaved tabs
  useEffect(() => {
    const hasDirty = tabs.some((t) => t.kind === "file" && t.dirty);
    if (!hasDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [tabs]);

  const refreshOverview = useCallback(async () => {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/ide/overview`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as ProjectIdeOverviewDto;
    setCapabilities(data.capabilities);
    setWorkspaces(data.workspaces);
    if (selectedWorkspaceId && !data.workspaces.some((w) => w.id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(data.workspaces[0]?.id ?? "");
    }
  }, [projectId, selectedWorkspaceId]);

  const loadCollabSessions = useCallback(async () => {
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions`,
      { cache: "no-store" },
    );
    if (!res.ok) return;
    const data = (await res.json()) as { sessions: CollabSessionSummaryDto[] };
    const list = data.sessions ?? [];
    setCollabSessions(list);
    // Automatically attach to an active collaborative session bound to the selected workspace
    if (!activeCollabSession && selectedWorkspaceId) {
      const match = list.find(
        (s) =>
          s.workspaceId === selectedWorkspaceId &&
          s.status === "ACTIVE" &&
          s.myStatus === "ACTIVE",
      );
      if (match) {
        const detailRes = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(match.id)}`,
          { cache: "no-store" },
        );
        if (detailRes.ok) {
          setActiveCollabSession((await detailRes.json()) as CollabSessionDetailDto);
        }
      }
    }
  }, [projectId, activeCollabSession, selectedWorkspaceId]);

  useEffect(() => {
    void loadCollabSessions();
  }, [loadCollabSessions]);

  const refreshActiveCollabSession = useCallback(
    async (sessionId: string) => {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(sessionId)}`,
        { cache: "no-store" },
      );
      if (res.status === 403 || res.status === 404) {
        setCollabConnState("PERMISSION_REVOKED");
        setCollabConnMessage("Your access to this collaborative session ended or was revoked.");
        setActiveCollabSession(null);
        return;
      }
      if (res.ok) {
        const detail = (await res.json()) as CollabSessionDetailDto;
        setActiveCollabSession(detail);
        if (detail.status === "CLOSED") {
          setCollabConnState("SESSION_CLOSED");
          setCollabConnMessage("Collaborative session closed.");
        }
      }
    },
    [projectId],
  );

  // Poll active session participants & persisted discussion messages smoothly
  useEffect(() => {
    if (!activeCollabSession || activeCollabSession.status !== "ACTIVE") return;
    const interval = setInterval(() => {
      void refreshActiveCollabSession(activeCollabSession.id);
    }, 4500);
    return () => clearInterval(interval);
  }, [activeCollabSession, refreshActiveCollabSession]);

  // Dispose collaborative Yjs handles when leaving workspace/session or unmounting
  const disposeAllCollabHandles = useCallback(() => {
    for (const handle of collabHandlesRef.current.values()) {
      handle.destroy();
    }
    collabHandlesRef.current.clear();
    setActiveDocHandle(null);
    setActiveDocKey("");
    setRemotePeers([]);
  }, []);

  useEffect(() => disposeAllCollabHandles, [disposeAllCollabHandles]);

  // Reset active collaboration connection when session becomes inactive or revoked
  useEffect(() => {
    if (
      !activeCollabSession ||
      activeCollabSession.status !== "ACTIVE" ||
      activeCollabSession.myStatus !== "ACTIVE" ||
      activeCollabSession.workspaceId !== selectedWorkspaceId
    ) {
      disposeAllCollabHandles();
      if (!activeCollabSession) {
        setCollabConnState("IDLE");
        setCollabConnMessage(null);
      }
    }
  }, [activeCollabSession, selectedWorkspaceId, disposeAllCollabHandles]);

  const activeFilePathForCollab = activeTab?.kind === "file" ? activeTab.path : null;
  const activeFileCanSync =
    activeTab?.kind === "file" && !activeTab.isBinary && !activeTab.isTooLarge;
  const loadTreeRef = useRef<(wsId: string) => Promise<void>>(async () => {});

  // Bind/switch Yjs CRDT synchronization for currently open file inside active collaboration session
  useEffect(() => {
    if (
      !activeCollabSession ||
      activeCollabSession.status !== "ACTIVE" ||
      activeCollabSession.myStatus !== "ACTIVE" ||
      !selectedWorkspaceId ||
      activeCollabSession.workspaceId !== selectedWorkspaceId ||
      !activeFilePathForCollab ||
      !activeFileCanSync
    ) {
      setActiveDocHandle(null);
      setActiveDocKey("");
      for (const h of collabHandlesRef.current.values()) {
        h.updateActiveFile(activeFilePathForCollab);
      }
      return;
    }

    const cacheKey = `${activeCollabSession.id}::${activeFilePathForCollab}`;
    let handle = collabHandlesRef.current.get(cacheKey);
    if (!handle) {
      const currentTabContent =
        tabsRef.current.find(
          (t): t is FileTab => t.kind === "file" && t.path === activeFilePathForCollab,
        )?.content ?? "";
      const sessionId = activeCollabSession.id;
      const filePath = activeFilePathForCollab;
      handle = createCollabDocHandle({
        sessionId,
        filePath,
        initialContent: currentTabContent,
        initialRole: activeCollabSession.myRole ?? "VIEWER",
        callbacks: {
          fetchTicket: async () => {
            const res = await fetch(
              `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(sessionId)}/ticket`,
              { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
            );
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              throw new Error(data?.message || "Failed to fetch collaboration ticket.");
            }
            return data as CollabWsTicketDto;
          },
          onStateChange: (nextState, msg) => {
            setCollabConnState(nextState);
            setCollabConnMessage(msg);
            const current = collabHandlesRef.current.get(cacheKey);
            if (current?.docKey) {
              setActiveDocKey(current.docKey);
            }
            if (nextState === "PERMISSION_REVOKED" || nextState === "SESSION_CLOSED") {
              void refreshActiveCollabSession(sessionId);
            }
          },
          onRoleChange: (nextRole) => {
            setActiveCollabSession((prev) =>
              prev && prev.id === sessionId ? { ...prev, myRole: nextRole } : prev,
            );
          },
          onPeersChange: (peers) => {
            setRemotePeers(peers);
          },
          onDocumentDeleted: (deletedPath, message) => {
            setError(message);
            setTabs((prev) => {
              const filtered = prev.filter((t) => !(t.kind === "file" && t.path === deletedPath));
              return filtered;
            });
            collabHandlesRef.current.delete(`${sessionId}::${deletedPath}`);
            if (selectedWorkspaceId) {
              void loadTreeRef.current(selectedWorkspaceId);
            }
          },
          onFileEvent: () => {
            if (selectedWorkspaceId) {
              void loadTreeRef.current(selectedWorkspaceId);
            }
          },
          onTextChange: (nextText) => {
            setTabs((prev) =>
              prev.map((t) =>
                t.kind === "file" && t.path === filePath
                  ? { ...t, content: nextText, dirty: false }
                  : t,
              ),
            );
          },
        },
      });
      collabHandlesRef.current.set(cacheKey, handle);
    }

    for (const h of collabHandlesRef.current.values()) {
      h.updateActiveFile(activeFilePathForCollab);
    }
    setActiveDocHandle(handle);
    setActiveDocKey(handle.docKey || activeFilePathForCollab);
  }, [
    projectId,
    selectedWorkspaceId,
    activeCollabSession?.id,
    activeCollabSession?.status,
    activeCollabSession?.myStatus,
    activeCollabSession?.workspaceId,
    activeCollabSession?.myRole,
    activeFilePathForCollab,
    activeFileCanSync,
    refreshActiveCollabSession,
  ]);

  const loadWorkspaceTreeAndGit = useCallback(
    async (wsId: string) => {
      if (!wsId) {
        setTreeEntries([]);
        setGitStatus(null);
        return;
      }
      setTreeLoading(true);
      setGitLoading(true);
      try {
        const [treeRes, gitRes] = await Promise.all([
          fetch(
            `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(wsId)}/tree`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(wsId)}/git/status`,
            { cache: "no-store" },
          ),
        ]);
        if (treeRes.ok) {
          const data = (await treeRes.json()) as { entries: WorkspaceTreeEntryDto[] };
          setTreeEntries(data.entries ?? []);
        } else {
          setTreeEntries([]);
        }
        if (gitRes.ok) {
          setGitStatus((await gitRes.json()) as WorkspaceGitStatusDto);
        } else {
          setGitStatus(null);
        }
      } finally {
        setTreeLoading(false);
        setGitLoading(false);
      }
    },
    [projectId],
  );

  useEffect(() => {
    loadTreeRef.current = loadWorkspaceTreeAndGit;
  }, [loadWorkspaceTreeAndGit]);

  useEffect(() => {
    if (!selectedWorkspace || !selectedWorkspace.directoryPresent) {
      setTreeEntries([]);
      setGitStatus(null);
      return;
    }
    if (["READY", "ACTIVE", "SUSPENDED", "STOPPED"].includes(selectedWorkspace.status)) {
      void loadWorkspaceTreeAndGit(selectedWorkspace.id);
    }
  }, [selectedWorkspace?.id, selectedWorkspace?.status, selectedWorkspace?.directoryPresent, loadWorkspaceTreeAndGit]);

  // Debounced server-backed workspace search
  useEffect(() => {
    if (!selectedWorkspace || !selectedWorkspace.directoryPresent || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const wsId = selectedWorkspace.id;
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(wsId)}/search?q=${encodeURIComponent(searchQuery.trim())}&mode=${searchMode}`,
          { cache: "no-store" },
        );
        if (res.ok) {
          const data = (await res.json()) as { matches: WorkspaceSearchMatchDto[] };
          setSearchResults(data.matches ?? []);
          setSearchActiveIdx(0);
        }
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [projectId, selectedWorkspace, searchQuery, searchMode]);

  async function openFile(relPath: string, forceReload = false) {
    if (!selectedWorkspace) return;
    const tabId = `file:${relPath}`;
    const existing = tabs.find((t): t is FileTab => t.kind === "file" && t.id === tabId);
    if (existing && !forceReload) {
      setActiveTabId(tabId);
      setMobileExplorerOpen(false);
      return;
    }

    setError(null);
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/file?path=${encodeURIComponent(relPath)}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || `Could not open ${relPath}.`);
      return;
    }
    const file = data as WorkspaceFileContentDto;
    const nextTab: FileTab = {
      kind: "file",
      id: tabId,
      path: file.path,
      name: file.name,
      content: file.content,
      savedContent: file.content,
      versionHash: file.versionHash,
      size: file.size,
      isBinary: file.isBinary,
      isTooLarge: file.isTooLarge,
      language: file.language,
      dirty: false,
      saving: false,
      conflictMessage: null,
    };
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return [...prev, nextTab];
      const copy = [...prev];
      copy[idx] = nextTab;
      return copy;
    });
    setActiveTabId(tabId);
    setMobileExplorerOpen(false);
  }

  const saveTab = useCallback(
    async (tabId: string) => {
      if (!selectedWorkspace) return;
      const target = tabs.find((t): t is FileTab => t.kind === "file" && t.id === tabId);
      if (!target || !selectedWorkspace.canWrite || target.isBinary || target.isTooLarge) return;

      setTabs((prev) =>
        prev.map((t) =>
          t.kind === "file" && t.id === tabId ? { ...t, saving: true, conflictMessage: null } : t,
        ),
      );
      setError(null);

      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/file`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: target.path,
              content: target.content,
              expectedVersionHash: activeDocHandle ? null : target.versionHash,
            }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.message || "Failed to save file.";
          setTabs((prev) =>
            prev.map((t) =>
              t.kind === "file" && t.id === tabId
                ? { ...t, saving: false, conflictMessage: res.status === 409 ? msg : null }
                : t,
            ),
          );
          setError(msg);
          return;
        }
        const saved = data as { versionHash: string; size: number };
        setTabs((prev) =>
          prev.map((t) =>
            t.kind === "file" && t.id === tabId
              ? {
                  ...t,
                  saving: false,
                  dirty: false,
                  savedContent: target.content,
                  versionHash: saved.versionHash,
                  size: saved.size,
                  conflictMessage: null,
                }
              : t,
          ),
        );
        setNotice(`Saved ${target.path}`);
        void loadWorkspaceTreeAndGit(selectedWorkspace.id);
      } catch {
        setTabs((prev) =>
          prev.map((t) =>
            t.kind === "file" && t.id === tabId ? { ...t, saving: false } : t,
          ),
        );
        setError("Network error while saving file.");
      }
    },
    [loadWorkspaceTreeAndGit, projectId, selectedWorkspace, tabs],
  );

  async function saveAllDirtyTabs() {
    const dirtyTabs = tabs.filter((t): t is FileTab => t.kind === "file" && t.dirty);
    for (const tab of dirtyTabs) {
      await saveTab(tab.id);
    }
  }

  function closeTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.kind === "file" && tab.dirty) {
      setConfirmState({
        title: `Discard unsaved changes to ${tab.name}?`,
        description: "You have unsaved edits in this file tab. Closing it will discard unsaved text.",
        confirmLabel: "Discard changes",
        danger: true,
        run: async () => {
          forceCloseTab(tabId);
        },
      });
      return;
    }
    forceCloseTab(tabId);
  }

  function forceCloseTab(tabId: string) {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== tabId);
      if (activeTabId === tabId) {
        setActiveTabId(remaining[remaining.length - 1]?.id ?? "");
      }
      return remaining;
    });
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setCreatingWs(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newWsName.trim() || undefined,
            branch: newWsBranch.trim() || undefined,
            taskId: newWsTaskId.trim() || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not create workspace.");
        return;
      }
      const created = data as DevWorkspaceDto;
      setNewWsName("");
      setNewWsOpen(false);
      setTabs([]);
      setActiveTabId("");
      setSelectedWorkspaceId(created.id);
      await refreshOverview();
      setNotice(`Workspace "${created.name}" ready from ${created.repoFullName}@${created.baseCommitSha?.slice(0, 7) ?? "head"}.`);
    } catch {
      setError("Network error while creating workspace.");
    } finally {
      setCreatingWs(false);
    }
  }

  async function handleLifecycle(action: "suspend" | "stop" | "resume" | "snapshots" | "delete") {
    if (!selectedWorkspace) return;
    setLifecycleBusy(true);
    setError(null);
    setNotice(null);
    try {
      const url =
        action === "delete"
          ? `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}`
          : `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/${action}`;
      const res = await fetch(url, {
        method: action === "delete" ? "DELETE" : "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || `Could not ${action} workspace.`);
        return;
      }
      if (action === "delete") {
        setTabs([]);
        setActiveTabId("");
      }
      await refreshOverview();
      setNotice(
        action === "snapshots"
          ? "Recovery snapshot saved."
          : action === "delete"
            ? "Workspace deleted cleanly."
            : `Workspace ${action} completed.`,
      );
    } catch {
      setError(`Network error while attempting ${action}.`);
    } finally {
      setLifecycleBusy(false);
    }
  }

  async function handleFsDialogSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedWorkspace || !fsDialog || !fsDialog.value.trim()) return;
    setFsBusy(true);
    setError(null);
    try {
      if (fsDialog.mode === "rename") {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/rename`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ oldPath: fsDialog.targetPath, newPath: fsDialog.value.trim() }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.message || "Rename failed.");
          return;
        }
        forceCloseTab(`file:${fsDialog.targetPath}`);
        setNotice(`Renamed to ${fsDialog.value.trim()}`);
      } else {
        const type = fsDialog.mode === "create-folder" ? "directory" : "file";
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/files`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type, path: fsDialog.value.trim(), content: "" }),
          },
        );
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.message || "Creation failed.");
          return;
        }
        if (type === "file") {
          void openFile(fsDialog.value.trim(), true);
        }
        setNotice(`Created ${fsDialog.value.trim()}`);
      }
      setFsDialog(null);
      await loadWorkspaceTreeAndGit(selectedWorkspace.id);
    } finally {
      setFsBusy(false);
    }
  }

  async function executeDeleteEntry(relPath: string, isDir: boolean) {
    if (!selectedWorkspace) return;
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/delete-entry`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: relPath, confirmNonEmpty: isDir }),
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || `Could not delete ${relPath}.`);
      return;
    }
    forceCloseTab(`file:${relPath}`);
    await loadWorkspaceTreeAndGit(selectedWorkspace.id);
    setNotice(`Deleted ${relPath}`);
  }

  async function openGitDiff(
    scope: "unstaged" | "staged" | "commit",
    relPath?: string,
    sha?: string,
    customTitle?: string,
  ) {
    if (!selectedWorkspace) return;
    const params = new URLSearchParams({ scope });
    if (relPath) params.set("path", relPath);
    if (sha) params.set("sha", sha);
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/git/diff?${params.toString()}`,
      { cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.message || "Could not load diff.");
      return;
    }
    const diff = data as { files: PullRequestChangedFileDto[] };
    const id = `diff:${scope}:${relPath ?? sha ?? "all"}`;
    const tab: DiffTab = {
      kind: "diff",
      id,
      title: customTitle ?? (relPath ? `${relPath} (${scope})` : `${scope} diff`),
      badgeText:
        scope === "staged"
          ? "Staged local changes (not pushed)"
          : scope === "commit"
            ? `Local commit ${sha?.slice(0, 7) ?? ""}`
            : "Unstaged local edits",
      files: diff.files,
    };
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return [...prev, tab];
      const next = [...prev];
      next[idx] = tab;
      return next;
    });
    setActiveTabId(id);
  }

  function openAiProposalPreview(
    proposalId: string,
    taskIdentifier: string,
    version: number,
    files: PullRequestChangedFileDto[],
  ) {
    const id = `diff:ai:${proposalId}`;
    const tab: DiffTab = {
      kind: "diff",
      id,
      title: `AI ${taskIdentifier} v${version}`,
      badgeText: "AI proposal preview — apply explicitly to workspace (not pushed to GitHub)",
      files,
    };
    setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, tab]));
    setActiveTabId(id);
  }

  async function handleGitAction(
    endpoint: "stage" | "unstage" | "commit" | "branch",
    body: Record<string, unknown>,
  ) {
    if (!selectedWorkspace) return;
    setGitBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/git/${endpoint}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || `Git ${endpoint} failed.`);
        return;
      }
      if (endpoint === "commit") {
        setCommitMessage("");
        const committed = data as { shortSha: string; status: WorkspaceGitStatusDto };
        setGitStatus(committed.status);
        setNotice(`Committed locally as ${committed.shortSha} (not pushed to GitHub).`);
      } else {
        setGitStatus(data as WorkspaceGitStatusDto);
        if (endpoint === "branch") {
          setNewBranchName("");
          void loadWorkspaceTreeAndGit(selectedWorkspace.id);
        }
      }
      await refreshOverview();
    } finally {
      setGitBusy(false);
    }
  }

  async function handleApplyProposal(proposalId: string) {
    if (!selectedWorkspace) return;
    setPatchBusyId(proposalId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/apply-proposal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || "Could not apply AI proposal to workspace.");
        return;
      }
      const applied = data as { filesChanged: number; status: WorkspaceGitStatusDto };
      setGitStatus(applied.status);
      await Promise.all([refreshOverview(), loadWorkspaceTreeAndGit(selectedWorkspace.id)]);
      setNotice(
        `Applied AI patch to ${applied.filesChanged} local file(s). Review in Source Control before committing.`,
      );
    } finally {
      setPatchBusyId(null);
    }
  }

  // Smooth horizontal/vertical panel dragging
  const layoutRef = useRef<HTMLDivElement | null>(null);
  function startResize(kind: "left" | "right" | "bottom", e: React.PointerEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const initLeft = leftWidth;
    const initRight = rightWidth;
    const initBottom = bottomHeight;

    const onMove = (ev: PointerEvent) => {
      if (kind === "left") {
        setLeftWidth(Math.min(440, Math.max(200, initLeft + (ev.clientX - startX))));
      } else if (kind === "right") {
        setRightWidth(Math.min(500, Math.max(240, initRight - (ev.clientX - startX))));
      } else {
        setBottomHeight(Math.min(420, Math.max(140, initBottom - (ev.clientY - startY))));
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function renderTreeNodes(entries: WorkspaceTreeEntryDto[], depth = 0) {
    return entries.map((entry) => {
      if (entry.type === "directory") {
        const expanded = Boolean(expandedDirs[entry.path]);
        return (
          <div key={entry.path}>
            <div
              className="ide-tree-row"
              style={{ paddingLeft: `${0.45 + depth * 0.85}rem` }}
            >
              <button
                type="button"
                className="ide-tree-btn"
                onClick={() =>
                  setExpandedDirs((prev) => ({ ...prev, [entry.path]: !expanded }))
                }
              >
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
                <span className="truncate-text">{entry.name}</span>
              </button>
              {selectedWorkspace?.canWrite && (
                <div className="ide-tree-actions">
                  <button
                    type="button"
                    aria-label={`New file inside ${entry.path}`}
                    title="New file here"
                    onClick={() =>
                      setFsDialog({
                        mode: "create-file",
                        targetPath: entry.path,
                        value: `${entry.path}/`,
                      })
                    }
                  >
                    <FilePlus size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Rename ${entry.path}`}
                    title="Rename"
                    onClick={() =>
                      setFsDialog({
                        mode: "rename",
                        targetPath: entry.path,
                        value: entry.path,
                      })
                    }
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete folder ${entry.path}`}
                    title="Delete folder"
                    onClick={() =>
                      setConfirmState({
                        title: `Delete folder ${entry.path}?`,
                        description:
                          "Deleting a folder removes it and any nested files inside this workspace.",
                        confirmLabel: "Delete folder",
                        danger: true,
                        run: () => executeDeleteEntry(entry.path, true),
                      })
                    }
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
            {expanded && entry.children && renderTreeNodes(entry.children, depth + 1)}
          </div>
        );
      }

      const isActive = activeTabId === `file:${entry.path}`;
      return (
        <div
          key={entry.path}
          className={`ide-tree-row ${isActive ? "is-active" : ""}`}
          style={{ paddingLeft: `${1.3 + depth * 0.85}rem` }}
        >
          <button
            type="button"
            className="ide-tree-btn"
            onClick={() => void openFile(entry.path)}
          >
            <FileCode2 size={14} />
            <span className="truncate-text">{entry.name}</span>
          </button>
          {selectedWorkspace?.canWrite && (
            <div className="ide-tree-actions">
              <button
                type="button"
                aria-label={`Rename ${entry.path}`}
                title="Rename"
                onClick={() =>
                  setFsDialog({ mode: "rename", targetPath: entry.path, value: entry.path })
                }
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label={`Delete ${entry.path}`}
                title="Delete file"
                onClick={() =>
                  setConfirmState({
                    title: `Delete ${entry.path}?`,
                    description: "This deletes the file inside your workspace working tree.",
                    confirmLabel: "Delete file",
                    danger: true,
                    run: () => executeDeleteEntry(entry.path, false),
                  })
                }
              >
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </div>
      );
    });
  }

  const dirtyTabCount = tabs.filter((t) => t.kind === "file" && t.dirty).length;

  return (
    <div className="ide-root">
      {/* WORKER / STORAGE / ERROR BANNERS */}
      {!capabilities.workerReachable && (
        <div className="banner banner-warn" role="status">
          <AlertTriangle size={16} />
          <span>{capabilities.workerReason}</span>
        </div>
      )}

      {capabilities.workerReachable && selectedWorkspace?.storageWarning && (
        <div className="banner banner-neutral" role="status" style={{ fontSize: ".82rem" }}>
          <HardDrive size={15} />
          <span>{selectedWorkspace.storageWarning}</span>
        </div>
      )}

      {error && (
        <div className="banner banner-error" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="banner banner-success" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
        </div>
      )}

      {/* TOP IDE TOOLBAR */}
      <div className="ide-toolbar">
        <div className="inline-actions" style={{ gap: ".5rem", flexWrap: "wrap" }}>
          <Button
            type="button"
            variant="secondary"
            size="compact"
            className="ide-mobile-only"
            onClick={() => setMobileExplorerOpen((v) => !v)}
          >
            <Menu size={14} /> Explorer
          </Button>

          <select
            aria-label="Select workspace"
            className="field-select ide-ws-select"
            value={selectedWorkspaceId}
            onChange={(e) => {
              setSelectedWorkspaceId(e.target.value);
              setTabs([]);
              setActiveTabId("");
            }}
          >
            <option value="">No workspace selected</option>
            {workspaces.map((ws) => (
              <option key={ws.id} value={ws.id}>
                {ws.name} ({ws.status})
              </option>
            ))}
          </select>

          {selectedWorkspace && (
            <>
              <span className={workspaceStatusBadge(selectedWorkspace.status)}>
                {selectedWorkspace.status}
              </span>
              <span className="badge">
                <GitBranch size={11} /> {selectedWorkspace.currentBranch ?? selectedWorkspace.baseBranch}
              </span>
              {selectedWorkspace.baseCommitSha && (
                <code className="label-chip">{selectedWorkspace.baseCommitSha.slice(0, 7)}</code>
              )}
            </>
          )}

          <Button
            type="button"
            variant="secondary"
            size="compact"
            onClick={() => setNewWsOpen((v) => !v)}
          >
            <Plus size={14} /> New Workspace
          </Button>

          {activeCollabSession && activeCollabSession.workspaceId === selectedWorkspace?.id && (
            <div className="inline-actions" style={{ gap: ".4rem", marginLeft: ".25rem" }}>
              <span className="badge badge-accent">
                {collabConnState === "CONNECTED" ? "Live Sync" : collabConnState.replace(/_/g, " ")}
              </span>
              <div className="ide-avatar-stack" title="Session participants">
                {activeCollabSession.participants
                  .filter((p) => p.status === "ACTIVE")
                  .slice(0, 4)
                  .map((p) => {
                    const label = p.user.name || p.user.email;
                    return (
                      <span
                        key={p.id}
                        className="ide-avatar-pill"
                        style={{ backgroundColor: p.colorHex }}
                        title={`${label} (${p.role})`}
                      >
                        {label.slice(0, 2).toUpperCase()}
                      </span>
                    );
                  })}
              </div>
            </div>
          )}
        </div>

        <div className="inline-actions" style={{ gap: ".45rem", flexWrap: "wrap" }}>
          {activeTab?.kind === "file" && (
            <Button
              type="button"
              size="compact"
              disabled={!selectedWorkspace?.canWrite || !activeTab.dirty || activeTab.saving}
              onClick={() => void saveTab(activeTab.id)}
            >
              <Save size={13} /> {activeTab.saving ? "Saving…" : "Save"}
            </Button>
          )}
          {dirtyTabCount > 1 && (
            <Button
              type="button"
              variant="secondary"
              size="compact"
              disabled={!selectedWorkspace?.canWrite}
              onClick={() => void saveAllDirtyTabs()}
            >
              Save All ({dirtyTabCount})
            </Button>
          )}

          {selectedWorkspace && selectedWorkspace.canManage && (
            <>
              {["READY", "ACTIVE"].includes(selectedWorkspace.status) ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={lifecycleBusy}
                    onClick={() => void handleLifecycle("snapshots")}
                  >
                    <Camera size={13} /> Snapshot
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="compact"
                    disabled={lifecycleBusy}
                    onClick={() => void handleLifecycle("stop")}
                  >
                    <Square size={13} /> Stop
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="compact"
                  disabled={lifecycleBusy || selectedWorkspace.status === "EXPIRED"}
                  onClick={() => void handleLifecycle("resume")}
                >
                  <Play size={13} /> Resume
                </Button>
              )}

              <Button
                type="button"
                variant="secondary"
                size="compact"
                disabled={lifecycleBusy}
                aria-label="Delete workspace"
                onClick={() =>
                  setConfirmState({
                    title: `Delete workspace "${selectedWorkspace.name}"?`,
                    description:
                      "This permanently deletes the isolated workspace directory on the worker. Committed or pushed history elsewhere is untouched, but unpushed local commits inside this workspace will be removed.",
                    confirmLabel: "Delete workspace",
                    danger: true,
                    run: () => handleLifecycle("delete"),
                  })
                }
              >
                <Trash2 size={13} />
              </Button>
            </>
          )}

          <Button
            type="button"
            variant={showBottom ? "primary" : "secondary"}
            size="compact"
            onClick={() => setShowBottom((v) => !v)}
          >
            <PanelBottom size={13} /> Terminal
          </Button>
          <Button
            type="button"
            variant={showRightPanel && rightTab === "assistant" ? "primary" : "secondary"}
            size="compact"
            onClick={() => {
              if (showRightPanel && rightTab === "assistant") {
                setShowRightPanel(false);
              } else {
                setRightTab("assistant");
                setShowRightPanel(true);
              }
            }}
          >
            <Bot size={13} /> AI Assistant
          </Button>
          <Button
            type="button"
            variant={showRightPanel && rightTab === "collab" ? "primary" : "secondary"}
            size="compact"
            onClick={() => {
              if (showRightPanel && rightTab === "collab") {
                setShowRightPanel(false);
              } else {
                setRightTab("collab");
                setShowRightPanel(true);
              }
            }}
          >
            <Users size={13} /> Collab
            {activeCollabSession ? ` (${activeCollabSession.participantCount})` : ""}
          </Button>
          <Button
            type="button"
            variant={showRightPanel && rightTab === "context" ? "primary" : "secondary"}
            size="compact"
            onClick={() => {
              if (showRightPanel && rightTab === "context") {
                setShowRightPanel(false);
              } else {
                setRightTab("context");
                setShowRightPanel(true);
              }
            }}
          >
            <PanelRight size={13} /> Context
          </Button>
        </div>
      </div>

      {/* CREATE WORKSPACE PANEL */}
      {newWsOpen && (
        <section className="app-card" aria-label="Create development workspace">
          <div className="app-card-header">
            <h2 className="inline-actions">
              <Code2 size={17} /> Provision Isolated Workspace
            </h2>
            {workspaces.length > 0 && (
              <button type="button" className="text-action-link" onClick={() => setNewWsOpen(false)}>
                Close
              </button>
            )}
          </div>
          {!initialOverview.project.repositorySummary ? (
            <div className="banner banner-warn">
              <AlertTriangle size={16} />
              <span>
                Connect a GitHub repository in{" "}
                <Link href={`/app/projects/${encodeURIComponent(projectId)}/repository`}>
                  Project -&gt; Repository
                </Link>{" "}
                before initializing a workspace.
              </span>
            </div>
          ) : (
            <form onSubmit={handleCreateWorkspace} className="ide-create-form">
              <label className="field-group">
                Workspace name
                <input
                  type="text"
                  className="field-input"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  placeholder={`${initialOverview.project.repositorySummary.name}-dev`}
                  maxLength={80}
                />
              </label>
              <label className="field-group">
                Base branch ({initialOverview.project.repositorySummary.fullName})
                <input
                  type="text"
                  className="field-input mono-input"
                  value={newWsBranch}
                  onChange={(e) => setNewWsBranch(e.target.value)}
                  placeholder="main"
                  required
                />
              </label>
              <label className="field-group">
                Linked task (optional)
                <select
                  className="field-select"
                  value={newWsTaskId}
                  onChange={(e) => setNewWsTaskId(e.target.value)}
                >
                  <option value="">None</option>
                  {initialOverview.tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.identifier} · {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ alignSelf: "end" }}>
                <Button
                  type="submit"
                  size="compact"
                  disabled={creatingWs || !capabilities.workerReachable}
                >
                  {creatingWs ? (
                    <>
                      <Loader2 size={14} className="spin-icon" /> Initializing…
                    </>
                  ) : (
                    "Create workspace"
                  )}
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* MAIN MULTI-PANEL IDE WORKBENCH */}
      {!selectedWorkspace ? (
        <section className="empty-panel">
          <Code2 size={28} />
          <h3>No active development workspace</h3>
          <p>
            Provision an isolated workspace from your connected GitHub repository to browse code,
            edit in Monaco, stage/commit Git changes locally, and review AI proposals.
          </p>
        </section>
      ) : (
        <div ref={layoutRef} className="ide-workbench">
          {/* LEFT: EXPLORER / SEARCH / GIT */}
          <aside
            className={`ide-left ${mobileExplorerOpen ? "is-mobile-open" : ""}`}
            style={{ width: `${leftWidth}px` }}
            aria-label="Workspace sidebar"
          >
            <div className="ide-sidebar-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === "explorer"}
                className={leftTab === "explorer" ? "is-active" : ""}
                onClick={() => setLeftTab("explorer")}
              >
                <Files size={13} /> Files
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === "search"}
                className={leftTab === "search" ? "is-active" : ""}
                onClick={() => setLeftTab("search")}
              >
                <Search size={13} /> Search
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={leftTab === "git"}
                className={leftTab === "git" ? "is-active" : ""}
                onClick={() => setLeftTab("git")}
              >
                <GitBranch size={13} /> Git{" "}
                {gitStatus && gitStatus.files.length > 0 ? `(${gitStatus.files.length})` : ""}
              </button>
            </div>

            {leftTab === "explorer" && (
              <div className="ide-sidebar-pane">
                <div className="ide-pane-actions">
                  <span className="field-hint">Explorer</span>
                  <div className="inline-actions" style={{ gap: ".25rem" }}>
                    {selectedWorkspace.canWrite && selectedWorkspace.directoryPresent && (
                      <>
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="New file"
                          aria-label="New root file"
                          onClick={() =>
                            setFsDialog({ mode: "create-file", targetPath: "", value: "" })
                          }
                        >
                          <FilePlus size={13} />
                        </button>
                        <button
                          type="button"
                          className="icon-action-btn"
                          title="New folder"
                          aria-label="New root folder"
                          onClick={() =>
                            setFsDialog({ mode: "create-folder", targetPath: "", value: "" })
                          }
                        >
                          <FolderPlus size={13} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="icon-action-btn"
                      title="Refresh files"
                      aria-label="Refresh explorer"
                      onClick={() => void loadWorkspaceTreeAndGit(selectedWorkspace.id)}
                    >
                      <RefreshCw size={13} />
                    </button>
                  </div>
                </div>

                {fsDialog && (
                  <form onSubmit={handleFsDialogSubmit} className="ide-fs-inline-form">
                    <input
                      type="text"
                      className="field-input mono-input"
                      autoFocus
                      value={fsDialog.value}
                      onChange={(e) =>
                        setFsDialog((prev) => (prev ? { ...prev, value: e.target.value } : null))
                      }
                      placeholder={
                        fsDialog.mode === "create-folder"
                          ? "src/utils"
                          : fsDialog.mode === "rename"
                            ? "new/path.ts"
                            : "src/new-file.ts"
                      }
                    />
                    <div className="inline-actions" style={{ gap: ".35rem" }}>
                      <Button type="submit" size="compact" disabled={fsBusy}>
                        Apply
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="compact"
                        onClick={() => setFsDialog(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                )}

                {!selectedWorkspace.directoryPresent ? (
                  <div className="ide-pane-empty">
                    Workspace directory not active on worker.{" "}
                    {selectedWorkspace.snapshots.length > 0
                      ? "Click Resume to reconstruct from snapshot."
                      : ""}
                  </div>
                ) : treeLoading ? (
                  <div className="ide-pane-empty">Loading tree…</div>
                ) : treeEntries.length === 0 ? (
                  <div className="ide-pane-empty">Repository tree is empty.</div>
                ) : (
                  <div className="ide-tree-scroll">{renderTreeNodes(treeEntries)}</div>
                )}
              </div>
            )}

            {leftTab === "search" && (
              <div className="ide-sidebar-pane">
                <div className="form-stack" style={{ padding: ".55rem", gap: ".45rem" }}>
                  <input
                    type="search"
                    className="field-input"
                    placeholder={
                      searchMode === "files" ? "Search filenames…" : "Search code text…"
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setSearchActiveIdx((i) => Math.min(searchResults.length - 1, i + 1));
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setSearchActiveIdx((i) => Math.max(0, i - 1));
                      } else if (e.key === "Enter" && searchResults[searchActiveIdx]) {
                        e.preventDefault();
                        void openFile(searchResults[searchActiveIdx].path);
                      }
                    }}
                  />
                  <div className="inline-actions" style={{ gap: ".35rem" }}>
                    <button
                      type="button"
                      className={`badge ${searchMode === "files" ? "badge-accent" : ""}`}
                      onClick={() => setSearchMode("files")}
                    >
                      Filenames
                    </button>
                    <button
                      type="button"
                      className={`badge ${searchMode === "text" ? "badge-accent" : ""}`}
                      onClick={() => setSearchMode("text")}
                    >
                      In files
                    </button>
                    {searching && <Loader2 size={12} className="spin-icon" />}
                  </div>
                </div>
                <div className="ide-tree-scroll">
                  {searchResults.length === 0 && searchQuery.trim() && !searching ? (
                    <div className="ide-pane-empty">No matching files found.</div>
                  ) : (
                    searchResults.map((match, idx) => (
                      <button
                        key={`${match.path}:${match.lineNumber ?? idx}`}
                        type="button"
                        className={`ide-search-item ${idx === searchActiveIdx ? "is-active" : ""}`}
                        onClick={() => void openFile(match.path)}
                      >
                        <strong className="truncate-text">{match.name}</strong>
                        <small className="truncate-text mono-text">
                          {match.path}
                          {match.lineNumber ? `:${match.lineNumber}` : ""}
                        </small>
                        {match.preview && (
                          <span className="truncate-text field-hint">{match.preview}</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {leftTab === "git" && (
              <div className="ide-sidebar-pane">
                <div className="ide-pane-actions">
                  <span className="field-hint">
                    Source Control {gitLoading ? "…" : ""}
                  </span>
                  <button
                    type="button"
                    className="icon-action-btn"
                    title="Refresh Git status"
                    onClick={() => void loadWorkspaceTreeAndGit(selectedWorkspace.id)}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>

                <div className="ide-git-scroll">
                  <div className="banner banner-neutral" style={{ fontSize: ".76rem", padding: ".45rem .6rem" }}>
                    <span>Local workspace Git only — remote push is disabled in Brick 7.</span>
                  </div>

                  {!gitStatus ? (
                    <p className="field-hint">Git status unavailable.</p>
                  ) : (
                    <>
                      {/* Branch selector / creator */}
                      <div className="ide-git-box">
                        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
                          <span className="field-hint">Branch: <code>{gitStatus.branch}</code></span>
                          <code className="field-hint">{gitStatus.headSha.slice(0, 7)}</code>
                        </div>
                        {gitStatus.branches.length > 1 && (
                          <select
                            className="field-select"
                            disabled={gitBusy || !selectedWorkspace.canWrite}
                            value={gitStatus.branch}
                            onChange={(e) =>
                              void handleGitAction("branch", {
                                branch: e.target.value,
                                createNew: false,
                              })
                            }
                          >
                            {gitStatus.branches.map((b) => (
                              <option key={b} value={b}>
                                {b}
                              </option>
                            ))}
                          </select>
                        )}
                        <div className="inline-actions" style={{ gap: ".3rem" }}>
                          <input
                            type="text"
                            className="field-input mono-input"
                            placeholder="new-feature-branch"
                            value={newBranchName}
                            onChange={(e) => setNewBranchName(e.target.value)}
                            disabled={gitBusy || !selectedWorkspace.canWrite}
                          />
                          <Button
                            type="button"
                            size="compact"
                            variant="secondary"
                            disabled={
                              gitBusy || !selectedWorkspace.canWrite || !newBranchName.trim()
                            }
                            onClick={() =>
                              void handleGitAction("branch", {
                                branch: newBranchName.trim(),
                                createNew: true,
                              })
                            }
                          >
                            Branch
                          </Button>
                        </div>
                      </div>

                      {/* Local Commit Box */}
                      <div className="ide-git-box">
                        <textarea
                          className="field-textarea"
                          style={{ minHeight: "3.4rem" }}
                          placeholder="Local commit message…"
                          value={commitMessage}
                          onChange={(e) => setCommitMessage(e.target.value)}
                          disabled={gitBusy || !selectedWorkspace.canWrite}
                        />
                        <div className="inline-actions" style={{ gap: ".4rem", flexWrap: "wrap" }}>
                          <Button
                            type="button"
                            size="compact"
                            disabled={
                              gitBusy ||
                              !selectedWorkspace.canWrite ||
                              gitStatus.stagedCount === 0 ||
                              commitMessage.trim().length < 3
                            }
                            onClick={() =>
                              void handleGitAction("commit", { message: commitMessage })
                            }
                          >
                            <GitCommitHorizontal size={13} /> Commit ({gitStatus.stagedCount})
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="compact"
                            disabled={gitBusy || !selectedWorkspace.canWrite || gitStatus.files.length === 0}
                            onClick={() => void handleGitAction("stage", {})}
                          >
                            Stage all
                          </Button>
                          {gitStatus.stagedCount > 0 && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="compact"
                              disabled={gitBusy || !selectedWorkspace.canWrite}
                              onClick={() => void handleGitAction("unstage", {})}
                            >
                              Unstage all
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Changed Files */}
                      <div className="ide-git-section">
                        <strong>Changed files ({gitStatus.files.length})</strong>
                        {gitStatus.files.length === 0 ? (
                          <span className="field-hint">Working tree clean.</span>
                        ) : (
                          gitStatus.files.map((f) => (
                            <div key={f.path} className="ide-git-file-row">
                              <button
                                type="button"
                                className="ide-tree-btn"
                                onClick={() =>
                                  void openGitDiff(
                                    f.stagedStatus && !f.unstagedStatus ? "staged" : "unstaged",
                                    f.path,
                                  )
                                }
                              >
                                <span className="badge">
                                  {f.stagedStatus ?? ""}{f.unstagedStatus ?? (f.untracked ? "?" : "")}
                                </span>
                                <span className="truncate-text mono-text">{f.path}</span>
                              </button>
                              <div className="inline-actions" style={{ gap: ".2rem" }}>
                                <button
                                  type="button"
                                  className="icon-action-btn"
                                  title="Inspect diff"
                                  onClick={() =>
                                    void openGitDiff(
                                      f.stagedStatus && !f.unstagedStatus ? "staged" : "unstaged",
                                      f.path,
                                    )
                                  }
                                >
                                  <GitCompare size={12} />
                                </button>
                                {(f.unstagedStatus || f.untracked) && selectedWorkspace.canWrite && (
                                  <button
                                    type="button"
                                    className="icon-action-btn"
                                    title="Stage file"
                                    onClick={() =>
                                      void handleGitAction("stage", { paths: [f.path] })
                                    }
                                  >
                                    <Plus size={12} />
                                  </button>
                                )}
                                {f.stagedStatus && selectedWorkspace.canWrite && (
                                  <button
                                    type="button"
                                    className="icon-action-btn"
                                    title="Unstage file"
                                    onClick={() =>
                                      void handleGitAction("unstage", { paths: [f.path] })
                                    }
                                  >
                                    <Minus size={12} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Recent Local Commits */}
                      <div className="ide-git-section">
                        <strong>Local commits ({gitStatus.recentCommits.length})</strong>
                        {gitStatus.recentCommits.map((c) => (
                          <button
                            key={c.sha}
                            type="button"
                            className="ide-commit-item"
                            onClick={() =>
                              void openGitDiff("commit", undefined, c.sha, `Commit ${c.shortSha}`)
                            }
                          >
                            <code>{c.shortSha}</code>
                            <span className="truncate-text">{c.message}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </aside>

          <div
            className="ide-resizer-v"
            role="separator"
            aria-orientation="vertical"
            onPointerDown={(e) => startResize("left", e)}
          />

          {/* CENTER: EDITOR + BOTTOM TERMINAL/OUTPUT */}
          <div className="ide-center">
            <div className="ide-tabbar" role="tablist">
              <div className="ide-tab-list">
                {tabs.map((tab) => {
                  const isActive = tab.id === activeTabId;
                  const dirty = tab.kind === "file" && tab.dirty;
                  return (
                    <div
                      key={tab.id}
                      className={`ide-tab ${isActive ? "is-active" : ""}`}
                    >
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className="ide-tab-btn"
                        onClick={() => setActiveTabId(tab.id)}
                      >
                        <span className="truncate-text">
                          {tab.kind === "file" ? tab.name : tab.title}
                        </span>
                        {dirty && (
                          <span className="ide-dirty-dot" title="Unsaved changes">
                            ●
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="ide-tab-close"
                        aria-label={`Close ${tab.kind === "file" ? tab.name : tab.title}`}
                        onClick={() => closeTab(tab.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>

              {activeTab?.kind === "file" && (
                <div className="inline-actions" style={{ gap: ".35rem", paddingRight: ".5rem" }}>
                  <button
                    type="button"
                    className={`badge ${wordWrap === "on" ? "badge-accent" : ""}`}
                    onClick={() => setWordWrap((w) => (w === "on" ? "off" : "on"))}
                    title="Toggle word wrap"
                  >
                    <WrapText size={11} /> Wrap
                  </button>
                  <button
                    type="button"
                    className="badge"
                    onClick={() => setTabSize((s) => (s === 2 ? 4 : 2))}
                    title="Toggle indentation"
                  >
                    {tabSize} spaces
                  </button>
                </div>
              )}
            </div>

            {activeTab?.kind === "file" && activeTab.conflictMessage && (
              <div className="banner banner-error" style={{ borderRadius: 0 }}>
                <AlertTriangle size={15} />
                <span>{activeTab.conflictMessage}</span>
                <Button
                  type="button"
                  size="compact"
                  variant="secondary"
                  onClick={() => void openFile(activeTab.path, true)}
                >
                  Reload from disk
                </Button>
              </div>
            )}

            <div className="ide-editor-area">
              {!activeTab ? (
                <div className="ide-editor-placeholder">
                  <div className="form-stack" style={{ textAlign: "center", gap: ".5rem" }}>
                    <Code2 size={28} style={{ marginInline: "auto" }} />
                    <strong>Select a file from Explorer or Source Control</strong>
                    <span className="field-hint">
                      Ctrl/Cmd+S saves active edits with version-conflict protection.
                    </span>
                  </div>
                </div>
              ) : activeTab.kind === "diff" ? (
                <div className="ide-diff-scroll">
                  <div className="banner banner-neutral" style={{ marginBottom: ".75rem" }}>
                    <GitCompare size={15} />
                    <span>{activeTab.badgeText}</span>
                  </div>
                  <CodeDiffViewer
                    files={activeTab.files}
                    truncatedResponse={false}
                    comments={[]}
                    canReview={false}
                  />
                </div>
              ) : activeTab.isBinary ? (
                <div className="ide-editor-placeholder">
                  <p className="field-hint">
                    <code>{activeTab.path}</code> is a binary file ({activeTab.size} bytes) and
                    cannot be edited in text view.
                  </p>
                </div>
              ) : activeTab.isTooLarge ? (
                <div className="ide-editor-placeholder">
                  <p className="field-hint">
                    <code>{activeTab.path}</code> exceeds the editor limit ({activeTab.size}{" "}
                    bytes).
                  </p>
                </div>
              ) : (
                <DynamicMonacoEditor
                  filePath={activeTab.path}
                  value={activeTab.content}
                  language={activeTab.language}
                  readOnly={
                    !selectedWorkspace.canWrite ||
                    activeCollabSession?.myRole === "VIEWER"
                  }
                  wordWrap={wordWrap}
                  tabSize={tabSize}
                  collabBinding={
                    activeDocHandle &&
                    activeDocHandle.filePath === activeTab.path &&
                    activeDocKey
                      ? {
                          docKey: activeDocKey,
                          yText: activeDocHandle.yText,
                          awareness: activeDocHandle.awareness,
                        }
                      : null
                  }
                  revealLine={revealLine}
                  onChange={(nextVal) =>
                    setTabs((prev) =>
                      prev.map((t) =>
                        t.kind === "file" && t.id === activeTab.id
                          ? { ...t, content: nextVal, dirty: nextVal !== t.savedContent }
                          : t,
                      ),
                    )
                  }
                  onSave={() => void saveTab(activeTab.id)}
                  onSelectionChange={setEditorSelection}
                  onInlineAction={(kind, sel) => {
                    setRightTab("assistant");
                    setShowRightPanel(true);
                    setPendingInlineAction({ kind, selection: sel, seq: Date.now() });
                  }}
                />
              )}
            </div>

            {showBottom && (
              <>
                <div
                  className="ide-resizer-h"
                  role="separator"
                  aria-orientation="horizontal"
                  onPointerDown={(e) => startResize("bottom", e)}
                />
                <div className="ide-bottom" style={{ height: `${bottomHeight}px` }}>
                  <div className="ide-bottom-tabs">
                    <button
                      type="button"
                      className={bottomTab === "terminal" ? "is-active" : ""}
                      onClick={() => setBottomTab("terminal")}
                    >
                      <TerminalSquare size={13} /> Terminal
                    </button>
                    <button
                      type="button"
                      className={bottomTab === "output" ? "is-active" : ""}
                      onClick={() => setBottomTab("output")}
                    >
                      <Archive size={13} /> Output &amp; Audit ({selectedWorkspace.recentEvents.length})
                    </button>
                  </div>

                  <div className="ide-bottom-body">
                    {bottomTab === "terminal" ? (
                      <DynamicXtermTerminal
                        projectId={projectId}
                        workspaceId={selectedWorkspace.id}
                        canUseTerminal={selectedWorkspace.canUseTerminal && capabilities.terminalAvailable}
                        disabledReason={
                          !selectedWorkspace.canWrite
                            ? `Workspace is ${selectedWorkspace.status}; resume before using terminal.`
                            : capabilities.terminalReason
                        }
                      />
                    ) : (
                      <ul className="activity-list" style={{ padding: ".6rem", overflow: "auto", height: "100%" }}>
                        {selectedWorkspace.recentEvents.map((ev) => (
                          <li key={ev.id} className="activity-item">
                            <p>
                              <span className="badge" style={{ marginRight: ".35rem" }}>
                                {ev.eventType.replace(/_/g, " ").toLowerCase()}
                              </span>
                              {ev.message}
                            </p>
                            <small>
                              {ev.actor?.name || ev.actor?.email || "System"} ·{" "}
                              {formatDateTime(ev.createdAt)}
                            </small>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* RIGHT: COLLAPSIBLE CONTEXT PANEL (TASK, AI PROPOSALS, SNAPSHOTS) */}
          {showRightPanel && (
            <>
              <div
                className="ide-resizer-v"
                role="separator"
                aria-orientation="vertical"
                onPointerDown={(e) => startResize("right", e)}
              />
              <aside
                className="ide-right"
                style={{ width: `${rightWidth}px` }}
                aria-label="IDE assistant, collaboration, and context"
              >
                <div className="ide-sidebar-tabs" role="tablist">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightTab === "assistant"}
                    className={rightTab === "assistant" ? "is-active" : ""}
                    onClick={() => setRightTab("assistant")}
                  >
                    <Bot size={13} /> Assistant
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightTab === "collab"}
                    className={rightTab === "collab" ? "is-active" : ""}
                    onClick={() => setRightTab("collab")}
                  >
                    <Users size={13} /> Collab
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={rightTab === "context"}
                    className={rightTab === "context" ? "is-active" : ""}
                    onClick={() => setRightTab("context")}
                  >
                    <PanelRight size={13} /> Context
                  </button>
                </div>

                <div className="ide-right-scroll form-stack" style={{ gap: ".85rem" }}>
                  {rightTab === "assistant" && (
                    <IdeAiAssistantPanel
                      projectId={projectId}
                      workspaceId={selectedWorkspace.id}
                      canWriteWorkspace={
                        selectedWorkspace.canWrite && activeCollabSession?.myRole !== "VIEWER"
                      }
                      taskId={activeTask?.id ?? null}
                      collabSessionId={activeCollabSession?.id ?? null}
                      activeFilePath={activeTab?.kind === "file" ? activeTab.path : null}
                      selection={editorSelection}
                      treeEntries={treeEntries}
                      pendingInlineAction={pendingInlineAction}
                      onClearPendingInlineAction={() => setPendingInlineAction(null)}
                      onOpenCitation={(filePath, line) => {
                        void openFile(filePath).then(() => {
                          if (line && line > 0) {
                            setRevealLine({ line, seq: Date.now() });
                          }
                        });
                      }}
                      onPreviewDiff={(title, summary, files) => {
                        const diffId = `assistant-diff:${Date.now()}`;
                        setTabs((prev) => [
                          ...prev,
                          {
                            kind: "diff",
                            id: diffId,
                            title: title.slice(0, 42),
                            badgeText: summary,
                            files,
                          },
                        ]);
                        setActiveTabId(diffId);
                      }}
                      onWorkspacePatched={async (targetPaths) => {
                        await loadWorkspaceTreeAndGit(selectedWorkspace.id);
                        for (const p of targetPaths) {
                          if (tabs.some((t) => t.kind === "file" && t.path === p)) {
                            await openFile(p, true);
                          }
                        }
                        setNotice(`Applied AI assistant diff to ${targetPaths.length} file(s).`);
                      }}
                    />
                  )}

                  {rightTab === "collab" && (
                    <IdeCollabPanel
                      activeSession={activeCollabSession}
                      sessions={collabSessions}
                      remotePeers={remotePeers}
                      connectionState={collabConnState}
                      connectionMessage={collabConnMessage}
                      activeFilePath={activeTab?.kind === "file" ? activeTab.path : null}
                      canStartSession={selectedWorkspace.canManage || selectedWorkspace.canWrite}
                      busy={collabBusy}
                      onStartSession={async (inviteeIds) => {
                        setCollabBusy(true);
                        setError(null);
                        try {
                          const res = await fetch(
                            `/api/workspace/projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(selectedWorkspace.id)}/collab/sessions`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                inviteeIds,
                                activeFilePath: activeTab?.kind === "file" ? activeTab.path : null,
                              }),
                            },
                          );
                          const data = await res.json().catch(() => null);
                          if (!res.ok) {
                            setError(data?.message || "Could not start collaborative session.");
                            return;
                          }
                          setActiveCollabSession(data as CollabSessionDetailDto);
                          void loadCollabSessions();
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onSelectSession={async (sessionId) => {
                        setCollabBusy(true);
                        try {
                          await refreshActiveCollabSession(sessionId);
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onJoinSession={async (sessionId) => {
                        setCollabBusy(true);
                        try {
                          const res = await fetch(
                            `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(sessionId)}/join`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
                          );
                          if (res.ok) {
                            setActiveCollabSession((await res.json()) as CollabSessionDetailDto);
                            void loadCollabSessions();
                          }
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onLeaveSession={async (sessionId) => {
                        setCollabBusy(true);
                        try {
                          await fetch(
                            `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(sessionId)}/leave`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
                          );
                          disposeAllCollabHandles();
                          setActiveCollabSession(null);
                          void loadCollabSessions();
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onCloseSession={async (sessionId) => {
                        setCollabBusy(true);
                        try {
                          const res = await fetch(
                            `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(sessionId)}/close`,
                            { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
                          );
                          if (res.ok) {
                            disposeAllCollabHandles();
                            setActiveCollabSession((await res.json()) as CollabSessionDetailDto);
                            void loadCollabSessions();
                          }
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onInviteParticipant={async (userId, role) => {
                        if (!activeCollabSession) return;
                        setCollabBusy(true);
                        try {
                          const res = await fetch(
                            `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(activeCollabSession.id)}/participants`,
                            {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ userId, role }),
                            },
                          );
                          if (res.ok) setActiveCollabSession((await res.json()) as CollabSessionDetailDto);
                        } finally {
                          setCollabBusy(false);
                        }
                      }}
                      onUpdateRole={async (userId, role) => {
                        if (!activeCollabSession) return;
                        const res = await fetch(
                          `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(activeCollabSession.id)}/participants/${encodeURIComponent(userId)}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role }),
                          },
                        );
                        if (res.ok) setActiveCollabSession((await res.json()) as CollabSessionDetailDto);
                      }}
                      onRevokeParticipant={async (userId) => {
                        if (!activeCollabSession) return;
                        const res = await fetch(
                          `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(activeCollabSession.id)}/participants/${encodeURIComponent(userId)}`,
                          { method: "DELETE" },
                        );
                        if (res.ok) setActiveCollabSession((await res.json()) as CollabSessionDetailDto);
                      }}
                      onSendMessage={async (bodyText, filePath) => {
                        if (!activeCollabSession) return;
                        const res = await fetch(
                          `/api/workspace/projects/${encodeURIComponent(projectId)}/collab/sessions/${encodeURIComponent(activeCollabSession.id)}/messages`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ body: bodyText, filePath }),
                          },
                        );
                        if (res.ok) {
                          await refreshActiveCollabSession(activeCollabSession.id);
                        }
                      }}
                      onOpenFilePath={(filePath) => void openFile(filePath)}
                    />
                  )}

                  {rightTab === "context" && activeTask && (
                    <section className="app-card">
                      <div className="app-card-header">
                        <div className="inline-actions" style={{ gap: ".4rem" }}>
                          <span className="project-key">{activeTask.identifier}</span>
                          <TaskStatusBadge status={activeTask.status} />
                        </div>
                        <Link
                          href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(activeTask.id)}`}
                          className="text-action-link"
                        >
                          Task detail
                        </Link>
                      </div>
                      <strong style={{ fontSize: ".92rem" }}>{activeTask.title}</strong>
                      <div style={{ marginTop: ".45rem" }}>
                        <TaskPriorityBadge priority={activeTask.priority} />
                      </div>
                      <div style={{ marginTop: ".55rem" }}>
                        <Link
                          href={`/app/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(activeTask.id)}/agent`}
                          className="text-action-link"
                        >
                          Open AI Agent run
                        </Link>
                      </div>
                    </section>
                  )}

                  {rightTab === "context" && (
                    <section className="app-card" aria-labelledby="ide-ai-proposals-heading">
                    <div className="app-card-header">
                      <h2 id="ide-ai-proposals-heading" className="inline-actions" style={{ fontSize: ".95rem" }}>
                        <Bot size={15} /> AI Proposals ({initialOverview.proposals.length})
                      </h2>
                    </div>

                    {highlightedProposal && (
                      <div className="banner banner-neutral" style={{ marginBottom: ".5rem", fontSize: ".78rem" }}>
                        <span>Selected from AI run: {highlightedProposal.taskIdentifier}</span>
                      </div>
                    )}

                    {initialOverview.proposals.length === 0 ? (
                      <p className="field-hint">
                        No generated AI proposals in this project yet. Run an AI agent from a task to
                        review &amp; apply diffs here.
                      </p>
                    ) : (
                      <div className="form-stack" style={{ gap: ".6rem" }}>
                        {initialOverview.proposals.map((item) => (
                          <div key={item.proposal.id} className="ide-proposal-card">
                            <div className="inline-actions" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                              <span className="project-key">{item.taskIdentifier}</span>
                              <span className="badge">v{item.proposal.version} · {item.proposal.status.toLowerCase()}</span>
                            </div>
                            <strong style={{ fontSize: ".85rem" }}>{item.taskTitle}</strong>
                            <p className="field-hint" style={{ margin: 0 }}>
                              {item.proposal.summary} ({item.proposal.filesChangedCount} files, +
                              {item.proposal.additionsCount}/-{item.proposal.deletionsCount})
                            </p>
                            <div className="inline-actions" style={{ gap: ".4rem", flexWrap: "wrap" }}>
                              <Button
                                type="button"
                                variant="secondary"
                                size="compact"
                                onClick={() =>
                                  openAiProposalPreview(
                                    item.proposal.id,
                                    item.taskIdentifier,
                                    item.proposal.version,
                                    item.proposal.changedFiles,
                                  )
                                }
                              >
                                <GitCompare size={12} /> Preview diff
                              </Button>
                              <Button
                                type="button"
                                size="compact"
                                disabled={!selectedWorkspace.canWrite || patchBusyId === item.proposal.id}
                                onClick={() => void handleApplyProposal(item.proposal.id)}
                              >
                                {patchBusyId === item.proposal.id ? "Applying…" : "Apply to workspace"}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    </section>
                  )}

                  {rightTab === "context" && (
                    <section className="app-card" aria-labelledby="ide-snapshots-heading">
                    <div className="app-card-header">
                      <h2 id="ide-snapshots-heading" className="inline-actions" style={{ fontSize: ".95rem" }}>
                        <Camera size={15} /> Recovery Snapshots ({selectedWorkspace.snapshots.length})
                      </h2>
                    </div>

                    {selectedWorkspace.snapshots.length === 0 ? (
                      <p className="field-hint">
                        No snapshots captured yet. Stopping, suspending, or clicking Snapshot saves
                        local modified/untracked files safely.
                      </p>
                    ) : (
                      <ul className="activity-list">
                        {selectedWorkspace.snapshots.map((snap) => (
                          <li key={snap.id} className="activity-item">
                            <p>
                              <span className="badge" style={{ marginRight: ".35rem" }}>
                                {snap.status.toLowerCase()}
                              </span>
                              {snap.trackedFileCount} modified · {snap.untrackedFileCount} untracked
                              ({(snap.sizeBytes / 1024).toFixed(1)}KB)
                            </p>
                            <small>
                              <code>{snap.checksumSha256.slice(0, 8)}</code> ·{" "}
                              {formatDateTime(snap.createdAt)}
                            </small>
                          </li>
                        ))}
                      </ul>
                    )}
                    </section>
                  )}
                </div>
              </aside>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title ?? ""}
        description={confirmState?.description ?? ""}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        busy={confirmBusy}
        onConfirm={() => {
          if (!confirmState) return;
          const run = confirmState.run;
          setConfirmBusy(true);
          void run().finally(() => {
            setConfirmBusy(false);
            setConfirmState(null);
          });
        }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
