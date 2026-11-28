"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { loader, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNs } from "monaco-editor";
import type * as Y from "yjs";
import type { Awareness } from "y-protocols/awareness";
import type { AiInlineActionKind } from "@devcollab/shared";
import { useWorkspaceTheme } from "@/components/workspace-theme/workspace-theme";
import { MonacoYjsBinding, type MonacoRuntimeApi } from "./monaco-yjs-binding";

if (typeof window !== "undefined") {
  loader.config({ paths: { vs: "/monaco/vs" } });
}

export interface EditorSelectionRange {
  text: string;
  startLine: number;
  endLine: number;
}

export function MonacoCodeEditor({
  filePath,
  value,
  language,
  readOnly,
  wordWrap,
  tabSize,
  collabBinding,
  revealLine,
  onChange,
  onSave,
  onSelectionChange,
  onInlineAction,
}: {
  filePath: string;
  value: string;
  language: string;
  readOnly: boolean;
  wordWrap: "on" | "off";
  tabSize: 2 | 4;
  collabBinding?: {
    docKey: string;
    yText: Y.Text;
    awareness: Awareness;
  } | null;
  revealLine?: { line: number; seq: number } | null;
  onChange: (nextValue: string) => void;
  onSave: () => void;
  onSelectionChange?: (selection: EditorSelectionRange | null) => void;
  onInlineAction?: (kind: AiInlineActionKind, selection: EditorSelectionRange) => void;
}) {
  const { theme } = useWorkspaceTheme();
  const saveRef = useRef(onSave);
  const inlineActionRef = useRef(onInlineAction);
  const selectionRef = useRef(onSelectionChange);
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<MonacoRuntimeApi | null>(null);
  const [mountSeq, setMountSeq] = useState(0);

  useEffect(() => {
    saveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    inlineActionRef.current = onInlineAction;
  }, [onInlineAction]);

  useEffect(() => {
    selectionRef.current = onSelectionChange;
  }, [onSelectionChange]);

  // Attach/detach Yjs MonacoYjsBinding strictly client-side when collaborative mode is active
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    const model = editor?.getModel();
    if (!editor || !monaco || !model || !collabBinding) return;

    const styleEl = document.createElement("style");
    styleEl.setAttribute("data-devcollab-awareness", collabBinding.docKey);
    document.head.appendChild(styleEl);

    const refreshCursorStyles = () => {
      const rules: string[] = [];
      for (const [clientId, state] of collabBinding.awareness.getStates().entries()) {
        if (!state || typeof state !== "object") continue;
        const user = (state as { user?: { color?: string; name?: string } }).user;
        const color = user?.color || "#3b82f6";
        const label = (user?.name || "Peer").replace(/["\\]/g, "").slice(0, 24);
        rules.push(
          `.yRemoteSelection-${clientId} { background-color: ${color}29; }`,
          `.yRemoteSelectionHead-${clientId} { border-left: 2px solid ${color}; position: relative; }`,
          `.yRemoteSelectionHead-${clientId}::after { content: "${label}"; position: absolute; top: -1.15em; left: -2px; background: ${color}; color: #fff; font-size: 10px; line-height: 1.2; padding: 1px 4px; border-radius: 3px; white-space: nowrap; pointer-events: none; z-index: 20; }`,
        );
      }
      styleEl.textContent = rules.join("\n");
    };

    refreshCursorStyles();
    collabBinding.awareness.on("change", refreshCursorStyles);

    const binding = new MonacoYjsBinding(
      monaco,
      collabBinding.yText,
      model,
      editor,
      collabBinding.awareness,
    );

    return () => {
      collabBinding.awareness.off("change", refreshCursorStyles);
      binding.destroy();
      styleEl.remove();
    };
  }, [collabBinding, mountSeq]);

  // Navigate editor smoothly when user clicks a citation line link from AI Assistant
  useEffect(() => {
    if (!revealLine || !editorRef.current) return;
    const editor = editorRef.current;
    const line = Math.max(1, revealLine.line);
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, [revealLine, mountSeq]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as unknown as MonacoRuntimeApi;
    setMountSeq((n) => n + 1);

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });

    const extractSelection = (): EditorSelectionRange | null => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel || sel.isEmpty()) return null;
      const text = model.getValueInRange(sel);
      if (!text.trim()) return null;
      return {
        text,
        startLine: sel.startLineNumber,
        endLine: sel.endLineNumber,
      };
    };

    editor.onDidChangeCursorSelection(() => {
      selectionRef.current?.(extractSelection());
    });

    const registerInlineAction = (
      id: string,
      label: string,
      kind: AiInlineActionKind,
    ) => {
      editor.addAction({
        id,
        label: `DevCollab AI: ${label}`,
        contextMenuGroupId: "navigation",
        contextMenuOrder: 1.5,
        run: () => {
          const sel = extractSelection();
          if (sel) {
            inlineActionRef.current?.(kind, sel);
          } else {
            const pos = editor.getPosition();
            const model = editor.getModel();
            if (!model) return;
            const lineNum = pos?.lineNumber ?? 1;
            const lineContent = model.getLineContent(lineNum);
            inlineActionRef.current?.(kind, {
              text: lineContent,
              startLine: lineNum,
              endLine: lineNum,
            });
          }
        },
      });
    };

    registerInlineAction("devcollab.ai.explain", "Explain Selection", "EXPLAIN");
    registerInlineAction("devcollab.ai.improve", "Improve Selection", "IMPROVE");
    registerInlineAction("devcollab.ai.findBugs", "Find Possible Bugs", "FIND_BUGS");
    registerInlineAction("devcollab.ai.generateTests", "Generate Tests", "GENERATE_TESTS");
  };

  return (
    <Editor
      key={`${filePath}::${collabBinding ? `collab-${collabBinding.docKey || "active"}` : "local"}`}
      height="100%"
      width="100%"
      path={filePath}
      language={language}
      {...(collabBinding
        ? { defaultValue: value }
        : {
            value,
            onChange: (next) => onChange(next ?? ""),
          })}
      theme={theme === "light" ? "vs" : "vs-dark"}
      onMount={handleMount}
      loading={<div className="ide-editor-placeholder">Loading Monaco editor…</div>}
      options={{
        readOnly,
        wordWrap,
        tabSize,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "IBM Plex Mono, ui-monospace, SFMono-Regular, Menlo, monospace",
        lineNumbers: "on",
        renderLineHighlight: "all",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        smoothScrolling: false,
        padding: { top: 10, bottom: 10 },
      }}
    />
  );
}
