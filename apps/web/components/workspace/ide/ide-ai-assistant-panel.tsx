"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  Bot,
  Bug,
  CheckCircle2,
  CircleAlert,
  FileCode2,
  FlaskConical,
  GitCompare,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
  Wand2,
} from "lucide-react";
import type {
  AiAssistantAttachedContextDto,
  AiAssistantProposalDto,
  AiAssistantStatusDto,
  AiAssistantStreamEventDto,
  AiConversationDetailDto,
  AiConversationSummaryDto,
  AiInlineActionKind,
  AiMessageDto,
  PullRequestChangedFileDto,
  WorkspaceTreeEntryDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import type { EditorSelectionRange } from "./monaco-code-editor";

function proposalToChangedFiles(proposal: AiAssistantProposalDto): PullRequestChangedFileDto[] {
  // Parse per-file patches cleanly from unified diff sections for CodeDiffViewer preview
  const sections = proposal.unifiedDiff.split(/(?=^diff --git )/m).filter((s) => s.trim());
  return proposal.targetFiles.map((tf, idx) => {
    const patch = sections[idx] ?? proposal.unifiedDiff;
    return {
      sha: null,
      filename: tf.path,
      previousFilename: null,
      status: tf.operation === "create" ? "added" : tf.operation === "delete" ? "removed" : "modified",
      additions: tf.additions,
      deletions: tf.deletions,
      changes: tf.additions + tf.deletions,
      patch,
      isBinary: false,
      isTruncated: false,
      isLarge: false,
      lineCount: patch.split("\n").length,
      blobUrl: null,
    };
  });
}

export function IdeAiAssistantPanel({
  projectId,
  workspaceId,
  canWriteWorkspace,
  taskId,
  collabSessionId,
  activeFilePath,
  selection,
  treeEntries,
  pendingInlineAction,
  onClearPendingInlineAction,
  onOpenCitation,
  onPreviewDiff,
  onWorkspacePatched,
}: {
  projectId: string;
  workspaceId: string | null;
  canWriteWorkspace: boolean;
  taskId: string | null;
  collabSessionId: string | null;
  activeFilePath: string | null;
  selection: EditorSelectionRange | null;
  treeEntries: WorkspaceTreeEntryDto[];
  pendingInlineAction: { kind: AiInlineActionKind; selection: EditorSelectionRange; seq: number } | null;
  onClearPendingInlineAction: () => void;
  onOpenCitation: (filePath: string, line: number | null) => void;
  onPreviewDiff: (title: string, summary: string, files: PullRequestChangedFileDto[]) => void;
  onWorkspacePatched: (targetPaths: string[]) => Promise<void>;
}) {
  const [status, setStatus] = useState<AiAssistantStatusDto | null>(null);
  const [conversations, setConversations] = useState<AiConversationSummaryDto[]>([]);
  const [activeConv, setActiveConv] = useState<AiConversationDetailDto | null>(null);
  const [promptInput, setPromptInput] = useState("");
  const [includeLocalDiff, setIncludeLocalDiff] = useState(true);
  const [attachedPaths, setAttachedPaths] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamDraft, setStreamDraft] = useState("");
  const [streamContext, setStreamContext] = useState<AiAssistantAttachedContextDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [applyingMsgId, setApplyingMsgId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const lastSeqHandledRef = useRef<number>(0);

  const loadStatusAndList = useCallback(async () => {
    const [statusRes, listRes] = await Promise.all([
      fetch(`/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/status`, {
        cache: "no-store",
      }),
      fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations`,
        { cache: "no-store" },
      ),
    ]);
    if (statusRes.ok) {
      setStatus((await statusRes.json()) as AiAssistantStatusDto);
    }
    if (listRes.ok) {
      const payload = (await listRes.json()) as { conversations: AiConversationSummaryDto[] };
      setConversations(payload.conversations ?? []);
      if (!activeConv && payload.conversations.length > 0) {
        const firstId = payload.conversations[0]!.id;
        const detailRes = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(firstId)}`,
          { cache: "no-store" },
        );
        if (detailRes.ok) {
          setActiveConv((await detailRes.json()) as AiConversationDetailDto);
        }
      }
    }
  }, [projectId, activeConv]);

  useEffect(() => {
    void loadStatusAndList();
  }, [loadStatusAndList]);

  const ensureConversation = useCallback(async (): Promise<AiConversationDetailDto> => {
    if (activeConv) return activeConv;
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          taskId,
          collabSessionId,
          lastActiveFile: activeFilePath,
        }),
      },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || "Failed to initialize assistant conversation.");
    }
    const created = data as AiConversationDetailDto;
    setActiveConv(created);
    setConversations((prev) => [created, ...prev]);
    return created;
  }, [activeConv, projectId, workspaceId, taskId, collabSessionId, activeFilePath]);

  const runAssistantStream = useCallback(
    async (actionKind: AiInlineActionKind, customPrompt?: string, explicitSelection?: EditorSelectionRange | null) => {
      if (streaming) return;
      setErrorMsg(null);
      setStreamDraft("");
      setStreamContext(null);

      let conv: AiConversationDetailDto;
      try {
        conv = await ensureConversation();
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Could not start conversation.");
        return;
      }

      const usedSelection = explicitSelection !== undefined ? explicitSelection : selection;
      const effectivePrompt = (customPrompt ?? promptInput).trim();
      if (actionKind === "CHAT" && !effectivePrompt) return;

      if (actionKind === "CHAT") setPromptInput("");
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);

      const optimisticUserMsg: AiMessageDto = {
        id: `local-user-${Date.now()}`,
        conversationId: conv.id,
        author: null,
        role: "USER",
        actionKind,
        status: "COMPLETED",
        content:
          effectivePrompt ||
          `${actionKind.toLowerCase().replace(/_/g, " ")} (${activeFilePath ?? "selection"})`,
        errorMessage: null,
        attachedContext: null,
        citations: [],
        proposal: null,
        provider: status?.provider ?? null,
        model: status?.model ?? null,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setActiveConv((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, optimisticUserMsg] }
          : { ...conv, messages: [...conv.messages, optimisticUserMsg] },
      );

      try {
        const res = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(conv.id)}/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              prompt: effectivePrompt || undefined,
              actionKind,
              workspaceId,
              taskId,
              activeFilePath,
              selectedText: usedSelection?.text,
              selectionStartLine: usedSelection?.startLine,
              selectionEndLine: usedSelection?.endLine,
              attachedPaths,
              includeLocalDiff,
            }),
          },
        );

        if (!res.ok || !res.body) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.message || `Assistant request failed (${res.status}).`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.slice(5).trim();
            if (!raw) continue;
            let event: AiAssistantStreamEventDto;
            try {
              event = JSON.parse(raw) as AiAssistantStreamEventDto;
            } catch {
              continue;
            }

            if (event.type === "context") {
              setStreamContext(event.attachedContext);
            } else if (event.type === "delta") {
              setStreamDraft((prev) => prev + event.text);
            } else if (event.type === "done") {
              setStreamDraft("");
              setActiveConv((prev) =>
                prev
                  ? { ...prev, messages: [...prev.messages, event.message] }
                  : null,
              );
              void loadStatusAndList();
            } else if (event.type === "error") {
              setErrorMsg(event.message);
            }
          }
        }
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") {
          setErrorMsg("Generation cancelled.");
        } else {
          setErrorMsg(err instanceof Error ? err.message : "Streaming error.");
        }
      } finally {
        abortRef.current = null;
        setStreaming(false);
        // Sync persisted history cleanly after abort/finish
        const detailRes = await fetch(
          `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(conv.id)}`,
          { cache: "no-store" },
        ).catch(() => null);
        if (detailRes?.ok) {
          setActiveConv((await detailRes.json()) as AiConversationDetailDto);
        }
      }
    },
    [
      streaming,
      ensureConversation,
      selection,
      promptInput,
      activeFilePath,
      status?.provider,
      status?.model,
      projectId,
      workspaceId,
      taskId,
      attachedPaths,
      includeLocalDiff,
      loadStatusAndList,
    ],
  );

  // Trigger inline editor menu actions dispatched from MonacoCodeEditor
  useEffect(() => {
    if (!pendingInlineAction || pendingInlineAction.seq === lastSeqHandledRef.current) return;
    lastSeqHandledRef.current = pendingInlineAction.seq;
    const action = pendingInlineAction;
    onClearPendingInlineAction();
    void runAssistantStream(action.kind, undefined, action.selection);
  }, [pendingInlineAction, onClearPendingInlineAction, runAssistantStream]);

  const handleApplyProposal = async (msg: AiMessageDto) => {
    if (!activeConv || !msg.proposal || applyingMsgId) return;
    setApplyingMsgId(msg.id);
    setErrorMsg(null);
    try {
      const res = await fetch(
        `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(activeConv.id)}/messages/${encodeURIComponent(msg.id)}/apply-proposal`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to apply AI code proposal.");
      }
      const updatedMessage = data.message as AiMessageDto;
      setActiveConv((prev) =>
        prev
          ? {
              ...prev,
              messages: prev.messages.map((m) => (m.id === updatedMessage.id ? updatedMessage : m)),
            }
          : null,
      );
      await onWorkspacePatched(msg.proposal.targetFiles.map((f) => f.path));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to apply proposal.");
    } finally {
      setApplyingMsgId(null);
    }
  };

  const handleNewChat = async () => {
    setActiveConv(null);
    setErrorMsg(null);
    setStreamDraft("");
  };

  const handleSelectConversation = async (id: string) => {
    if (!id) return;
    const res = await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      setActiveConv((await res.json()) as AiConversationDetailDto);
      setErrorMsg(null);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await fetch(
      `/api/workspace/projects/${encodeURIComponent(projectId)}/ai/assistant/conversations/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    if (activeConv?.id === id) setActiveConv(null);
    setConversations((prev) => prev.filter((c) => c.id !== id));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void runAssistantStream("CHAT");
    } else if (e.key === "Escape") {
      if (streaming) {
        abortRef.current?.abort();
      } else {
        setPromptInput("");
      }
    }
  };

  const fileChoices = treeEntries.filter((e) => e.type === "file").slice(0, 80);

  return (
    <section className="app-card form-stack" style={{ gap: ".65rem" }} aria-label="IDE AI Assistant">
      <div className="app-card-header">
        <h2 className="inline-actions" style={{ fontSize: ".94rem" }}>
          <Bot size={15} /> Repository AI Assistant
        </h2>
        <div className="inline-actions" style={{ gap: ".3rem" }}>
          <Button type="button" size="compact" variant="secondary" onClick={() => void handleNewChat()}>
            <Plus size={12} /> New
          </Button>
          {activeConv && (
            <button
              type="button"
              className="icon-action-btn"
              title="Delete chat"
              aria-label="Delete conversation"
              onClick={() => void handleDeleteConversation(activeConv.id)}
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {status && !status.configured && (
        <div className="banner banner-warn" style={{ fontSize: ".77rem" }}>
          <CircleAlert size={14} />
          <span>{status.reason}</span>
        </div>
      )}

      {status?.configured && (
        <div className="inline-actions" style={{ justifyContent: "space-between", fontSize: ".72rem" }}>
          <span className="badge badge-accent">
            {status.provider} · {status.model}
          </span>
          <span className="field-hint">
            {(status.totalInputTokens + status.totalOutputTokens).toLocaleString()} tok · $
            {status.estimatedCostUsd}
          </span>
        </div>
      )}

      {conversations.length > 0 && (
        <select
          aria-label="Select AI assistant conversation"
          className="field-select"
          style={{ fontSize: ".78rem" }}
          value={activeConv?.id ?? ""}
          onChange={(e) => void handleSelectConversation(e.target.value)}
        >
          <option value="">New private conversation…</option>
          {conversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.messageCount})
            </option>
          ))}
        </select>
      )}

      {/* CONTEXT CHIPS */}
      <div className="ai-context-chips">
        {activeFilePath && (
          <span className="label-chip">
            <FileCode2 size={11} /> {activeFilePath}
          </span>
        )}
        {selection && (
          <span className="badge badge-progress">
            Lines {selection.startLine}–{selection.endLine}
          </span>
        )}
        <label className="label-chip" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includeLocalDiff}
            onChange={(e) => setIncludeLocalDiff(e.target.checked)}
          />{" "}
          Git diff
        </label>
        {fileChoices.length > 0 && (
          <select
            aria-label="Attach extra repository file to AI context"
            className="field-select"
            style={{ fontSize: ".72rem", padding: ".15rem .35rem", maxWidth: "145px" }}
            value=""
            onChange={(e) => {
              const val = e.target.value;
              if (val && !attachedPaths.includes(val)) {
                setAttachedPaths((prev) => [...prev.slice(-4), val]);
              }
            }}
          >
            <option value="">+ Attach file…</option>
            {fileChoices.map((f) => (
              <option key={f.path} value={f.path}>
                {f.path}
              </option>
            ))}
          </select>
        )}
        {attachedPaths.map((p) => (
          <button
            key={p}
            type="button"
            className="badge"
            title="Remove attached file"
            onClick={() => setAttachedPaths((prev) => prev.filter((item) => item !== p))}
          >
            {p} ×
          </button>
        ))}
      </div>

      {/* INLINE QUICK ACTIONS */}
      <div className="inline-actions" style={{ gap: ".3rem", flexWrap: "wrap" }}>
        <Button
          type="button"
          size="compact"
          variant="secondary"
          disabled={streaming || !activeFilePath || !status?.configured}
          onClick={() => void runAssistantStream("EXPLAIN")}
        >
          <Sparkles size={11} /> Explain
        </Button>
        <Button
          type="button"
          size="compact"
          variant="secondary"
          disabled={streaming || !activeFilePath || !status?.configured}
          onClick={() => void runAssistantStream("IMPROVE")}
        >
          <Wand2 size={11} /> Improve
        </Button>
        <Button
          type="button"
          size="compact"
          variant="secondary"
          disabled={streaming || !activeFilePath || !status?.configured}
          onClick={() => void runAssistantStream("FIND_BUGS")}
        >
          <Bug size={11} /> Find Bugs
        </Button>
        <Button
          type="button"
          size="compact"
          variant="secondary"
          disabled={streaming || !activeFilePath || !status?.configured}
          onClick={() => void runAssistantStream("GENERATE_TESTS")}
        >
          <FlaskConical size={11} /> Gen Tests
        </Button>
      </div>

      {errorMsg && (
        <div className="banner banner-error" style={{ fontSize: ".78rem" }} role="alert">
          <CircleAlert size={14} />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* MESSAGE STREAM / HISTORY */}
      <div className="ai-assistant-messages">
        {(!activeConv || activeConv.messages.length === 0) && !streamDraft && (
          <p className="field-hint" style={{ fontSize: ".78rem", margin: 0 }}>
            Ask about open files, trace bugs, or right-click a selection in Monaco for inline actions.
            Suggested code edits are previewed as diffs before applying.
          </p>
        )}

        {activeConv?.messages.map((msg) => (
          <div key={msg.id} className={`ai-msg-card is-${msg.role.toLowerCase()}`}>
            <div className="inline-actions" style={{ justifyContent: "space-between", fontSize: ".7rem" }}>
              <strong>{msg.role === "USER" ? "You" : "AI Assistant"}</strong>
              <span className="field-hint">
                {msg.actionKind !== "CHAT" ? `${msg.actionKind.toLowerCase()} · ` : ""}
                {msg.status === "CANCELLED"
                  ? "Cancelled"
                  : msg.status === "FAILED"
                    ? "Failed"
                    : msg.outputTokens > 0
                      ? `${msg.outputTokens} tok`
                      : ""}
              </span>
            </div>

            {msg.attachedContext && msg.role === "ASSISTANT" && (
              <div className="field-hint" style={{ fontSize: ".7rem", margin: ".2rem 0" }}>
                Context: {msg.attachedContext.includedFiles.map((f) => f.path).join(", ") || "project"}
                {msg.attachedContext.excludedSensitiveCount > 0
                  ? ` (${msg.attachedContext.excludedSensitiveCount} sensitive excluded)`
                  : ""}
              </div>
            )}

            <div className="ai-msg-body">{msg.content || msg.errorMessage}</div>

            {msg.citations.length > 0 && (
              <div className="ai-citations-row">
                {msg.citations.map((cit) => (
                  <button
                    key={cit.label}
                    type="button"
                    className="badge"
                    onClick={() => onOpenCitation(cit.filePath, cit.startLine)}
                  >
                    {cit.label}
                  </button>
                ))}
              </div>
            )}

            {msg.proposal && (
              <div className="ide-proposal-card" style={{ marginTop: ".45rem" }}>
                <strong style={{ fontSize: ".78rem" }}>{msg.proposal.summary}</strong>
                <div className="field-hint" style={{ fontSize: ".72rem" }}>
                  {msg.proposal.targetFiles
                    .map((f) => `${f.path} (+${f.additions}/-${f.deletions})`)
                    .join(", ")}
                </div>
                {msg.proposal.conflictReason && (
                  <p className="field-error" style={{ fontSize: ".74rem", margin: ".2rem 0" }}>
                    {msg.proposal.conflictReason}
                  </p>
                )}
                <div className="inline-actions" style={{ gap: ".35rem", flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    onClick={() =>
                      onPreviewDiff(
                        `Assistant Diff · ${msg.proposal!.summary}`,
                        msg.proposal!.summary,
                        proposalToChangedFiles(msg.proposal!),
                      )
                    }
                  >
                    <GitCompare size={11} /> Preview Diff
                  </Button>
                  {msg.proposal.appliedAt ? (
                    <span className="badge badge-accent">
                      <CheckCircle2 size={11} /> Applied
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="compact"
                      disabled={!canWriteWorkspace || applyingMsgId === msg.id}
                      onClick={() => void handleApplyProposal(msg)}
                    >
                      {applyingMsgId === msg.id ? "Applying…" : "Apply to Workspace"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {streaming && (
          <div className="ai-msg-card is-assistant">
            <div className="inline-actions" style={{ justifyContent: "space-between", fontSize: ".7rem" }}>
              <strong>AI Assistant (streaming…)</strong>
              {streamContext && (
                <span className="field-hint">
                  {streamContext.includedFiles.length} file(s) attached
                </span>
              )}
            </div>
            <div className="ai-msg-body">{streamDraft || "Thinking…"}</div>
          </div>
        )}
      </div>

      {/* PROMPT COMPOSER */}
      <div className="form-stack" style={{ gap: ".35rem" }}>
        <textarea
          className="field-input"
          rows={2}
          placeholder="Ask about selected code, tests, or bugs (Enter sends, Shift+Enter newline)…"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={8000}
          disabled={!status?.configured || !status.canRunAi}
        />
        <div className="inline-actions" style={{ justifyContent: "space-between" }}>
          <span className="field-hint" style={{ fontSize: ".72rem" }}>
            {selection ? `Using lines ${selection.startLine}–${selection.endLine}` : activeFilePath || "Repo context"}
          </span>
          <div className="inline-actions" style={{ gap: ".35rem" }}>
            {streaming ? (
              <Button
                type="button"
                size="compact"
                variant="secondary"
                onClick={() => abortRef.current?.abort()}
              >
                <Square size={12} /> Stop
              </Button>
            ) : (
              <>
                {errorMsg && (
                  <Button
                    type="button"
                    size="compact"
                    variant="secondary"
                    onClick={() => void runAssistantStream("CHAT", promptInput)}
                  >
                    <RefreshCw size={12} /> Retry
                  </Button>
                )}
                <Button
                  type="button"
                  size="compact"
                  disabled={!status?.configured || !status.canRunAi || !promptInput.trim()}
                  onClick={() => void runAssistantStream("CHAT")}
                >
                  <Send size={12} /> Ask
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
