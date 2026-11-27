"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Columns2,
  ExternalLink,
  FileCode2,
  FileDiff,
  FileMinus2,
  FilePlus2,
  MessageSquarePlus,
  Rows3,
  Search,
} from "lucide-react";
import type {
  DiffLineSide,
  PullRequestChangedFileDto,
  PullRequestReviewCommentDto,
} from "@devcollab/shared";
import { Button } from "@/components/ui/button";
import { buildSplitRows, parseUnifiedPatch, type ParsedDiffLine } from "@/lib/diff-parser";
import { formatDateTime } from "./task-badges";

const INITIAL_LINE_WINDOW = 450;

function statusBadgeMeta(status: PullRequestChangedFileDto["status"]) {
  if (status === "added") return { label: "Added", cls: "badge badge-accent", Icon: FilePlus2 };
  if (status === "removed") return { label: "Deleted", cls: "badge badge-warm", Icon: FileMinus2 };
  if (status === "renamed") return { label: "Renamed", cls: "badge badge-sage", Icon: FileDiff };
  return { label: "Modified", cls: "badge", Icon: FileCode2 };
}

export interface LineCommentAnchor {
  filePath: string;
  lineNumber: number;
  lineSide: DiffLineSide;
}

export function CodeDiffViewer({
  files,
  prHtmlUrl,
  truncatedResponse,
  comments,
  canReview,
  onSelectLineAnchor,
  activeAnchor,
  onClearAnchor,
  inlineCommentDraft,
  onChangeInlineDraft,
  onSubmitInlineComment,
  commentBusy,
}: {
  files: PullRequestChangedFileDto[];
  prHtmlUrl: string;
  truncatedResponse: boolean;
  comments: PullRequestReviewCommentDto[];
  canReview: boolean;
  onSelectLineAnchor: (anchor: LineCommentAnchor) => void;
  activeAnchor: LineCommentAnchor | null;
  onClearAnchor: () => void;
  inlineCommentDraft: string;
  onChangeInlineDraft: (value: string) => void;
  onSubmitInlineComment: (event: React.FormEvent) => void;
  commentBusy: boolean;
}) {
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified");
  const [fileQuery, setFileQuery] = useState("");
  const [activeFile, setActiveFile] = useState<string>(files[0]?.filename ?? "");
  const [expandedLargeFiles, setExpandedLargeFiles] = useState<Record<string, boolean>>({});
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [visibleLineCaps, setVisibleLineCaps] = useState<Record<string, number>>({});

  const filteredFiles = useMemo(() => {
    const q = fileQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        (f.previousFilename?.toLowerCase().includes(q) ?? false),
    );
  }, [fileQuery, files]);

  const commentsByFile = useMemo(() => {
    const map = new Map<string, PullRequestReviewCommentDto[]>();
    for (const c of comments) {
      if (!c.filePath) continue;
      const list = map.get(c.filePath) ?? [];
      list.push(c);
      map.set(c.filePath, list);
    }
    return map;
  }, [comments]);

  function toggleCollapse(filename: string) {
    setCollapsedFiles((prev) => ({ ...prev, [filename]: !prev[filename] }));
  }

  function scrollToFile(filename: string) {
    setActiveFile(filename);
    setCollapsedFiles((prev) => ({ ...prev, [filename]: false }));
    const id = `diff-file-${encodeURIComponent(filename)}`;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="diff-workspace">
      <aside className="diff-sidebar app-card" aria-label="Changed files">
        <div className="diff-sidebar-head">
          <h2>Files changed ({files.length})</h2>
          <div className="task-search-wrap" style={{ minWidth: 0 }}>
            <Search size={14} className="task-search-icon" />
            <input
              type="search"
              className="field-input task-search-input"
              style={{ minHeight: "2.1rem", fontSize: ".82rem" }}
              placeholder="Filter files…"
              value={fileQuery}
              onChange={(e) => setFileQuery(e.target.value)}
            />
          </div>
        </div>

        <ul className="diff-file-list">
          {filteredFiles.map((file) => {
            const count = commentsByFile.get(file.filename)?.length ?? 0;
            const selected = activeFile === file.filename;
            return (
              <li key={file.filename}>
                <button
                  type="button"
                  className="diff-file-nav-btn"
                  aria-current={selected ? "true" : undefined}
                  onClick={() => scrollToFile(file.filename)}
                >
                  <span className="diff-file-nav-name" title={file.filename}>
                    {file.filename}
                  </span>
                  <span className="diff-file-nav-meta">
                    <span className="diff-stat-add">+{file.additions}</span>
                    <span className="diff-stat-del">-{file.deletions}</span>
                    {count > 0 && <span className="tab-count">{count}</span>}
                  </span>
                </button>
              </li>
            );
          })}
          {filteredFiles.length === 0 && (
            <li className="field-hint" style={{ padding: ".6rem" }}>
              No files match &ldquo;{fileQuery}&rdquo;.
            </li>
          )}
        </ul>
      </aside>

      <div className="diff-main-col">
        <div className="diff-controls-bar">
          <div className="inline-actions" style={{ gap: ".5rem" }}>
            <span className="badge">
              Showing {filteredFiles.length} of {files.length} changed files
            </span>
            {truncatedResponse && (
              <span className="badge badge-warm">Partial file list (GitHub API limit)</span>
            )}
          </div>

          <div className="inline-actions" role="group" aria-label="Diff layout mode">
            <Button
              type="button"
              variant={viewMode === "unified" ? "primary" : "secondary"}
              size="compact"
              onClick={() => setViewMode("unified")}
            >
              <Rows3 size={14} /> Unified
            </Button>
            <Button
              type="button"
              variant={viewMode === "split" ? "primary" : "secondary"}
              size="compact"
              onClick={() => setViewMode("split")}
            >
              <Columns2 size={14} /> Side-by-side
            </Button>
          </div>
        </div>

        {filteredFiles.map((file) => (
          <DiffFileCard
            key={file.filename}
            file={file}
            viewMode={viewMode}
            collapsed={Boolean(collapsedFiles[file.filename])}
            onToggleCollapse={() => toggleCollapse(file.filename)}
            largeExpanded={Boolean(expandedLargeFiles[file.filename])}
            onExpandLarge={() =>
              setExpandedLargeFiles((prev) => ({ ...prev, [file.filename]: true }))
            }
            lineCap={visibleLineCaps[file.filename] ?? INITIAL_LINE_WINDOW}
            onShowMoreLines={() =>
              setVisibleLineCaps((prev) => ({
                ...prev,
                [file.filename]: (prev[file.filename] ?? INITIAL_LINE_WINDOW) + 450,
              }))
            }
            fileComments={commentsByFile.get(file.filename) ?? []}
            canReview={canReview}
            onSelectLineAnchor={onSelectLineAnchor}
            activeAnchor={
              activeAnchor?.filePath === file.filename ? activeAnchor : null
            }
            onClearAnchor={onClearAnchor}
            inlineCommentDraft={inlineCommentDraft}
            onChangeInlineDraft={onChangeInlineDraft}
            onSubmitInlineComment={onSubmitInlineComment}
            commentBusy={commentBusy}
            prHtmlUrl={prHtmlUrl}
          />
        ))}
      </div>
    </div>
  );
}

function DiffFileCard({
  file,
  viewMode,
  collapsed,
  onToggleCollapse,
  largeExpanded,
  onExpandLarge,
  lineCap,
  onShowMoreLines,
  fileComments,
  canReview,
  onSelectLineAnchor,
  activeAnchor,
  onClearAnchor,
  inlineCommentDraft,
  onChangeInlineDraft,
  onSubmitInlineComment,
  commentBusy,
  prHtmlUrl,
}: {
  file: PullRequestChangedFileDto;
  viewMode: "unified" | "split";
  collapsed: boolean;
  onToggleCollapse: () => void;
  largeExpanded: boolean;
  onExpandLarge: () => void;
  lineCap: number;
  onShowMoreLines: () => void;
  fileComments: PullRequestReviewCommentDto[];
  canReview: boolean;
  onSelectLineAnchor: (anchor: LineCommentAnchor) => void;
  activeAnchor: LineCommentAnchor | null;
  onClearAnchor: () => void;
  inlineCommentDraft: string;
  onChangeInlineDraft: (value: string) => void;
  onSubmitInlineComment: (event: React.FormEvent) => void;
  commentBusy: boolean;
  prHtmlUrl: string;
}) {
  const { label, cls, Icon } = statusBadgeMeta(file.status);
  const parsedLines = useMemo(
    () => (file.patch && (!file.isLarge || largeExpanded) ? parseUnifiedPatch(file.patch) : []),
    [file.isLarge, file.patch, largeExpanded],
  );
  const visibleLines = useMemo(() => parsedLines.slice(0, lineCap), [lineCap, parsedLines]);
  const splitRows = useMemo(
    () => (viewMode === "split" ? buildSplitRows(visibleLines) : []),
    [viewMode, visibleLines],
  );
  const hasMoreLines = parsedLines.length > visibleLines.length;

  const commentsByLine = useMemo(() => {
    const map = new Map<string, PullRequestReviewCommentDto[]>();
    for (const c of fileComments) {
      const key =
        c.lineNumber && c.lineSide ? `${c.lineSide}:${c.lineNumber}` : "FILE_LEVEL";
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [fileComments]);

  const fileLevelComments = commentsByLine.get("FILE_LEVEL") ?? [];
  const githubFileUrl = file.blobUrl || prHtmlUrl;

  function renderInlineComposer(keyMatch: string) {
    if (!activeAnchor || !canReview) return null;
    const activeKey = `${activeAnchor.lineSide}:${activeAnchor.lineNumber}`;
    if (activeKey !== keyMatch) return null;
    return (
      <div className="diff-inline-composer">
        <form onSubmit={onSubmitInlineComment} className="form-stack" style={{ gap: ".5rem" }}>
          <div className="inline-actions" style={{ justifyContent: "space-between" }}>
            <span className="comment-meta">
              Commenting on <code>{file.filename}</code> line {activeAnchor.lineNumber} (
              {activeAnchor.lineSide === "LEFT" ? "old" : "new"}) — internal DevCollab note
            </span>
            <button type="button" className="text-action-link" onClick={onClearAnchor}>
              Cancel
            </button>
          </div>
          <textarea
            className="field-textarea"
            required
            maxLength={4000}
            value={inlineCommentDraft}
            onChange={(e) => onChangeInlineDraft(e.target.value)}
            placeholder="Write an internal review comment on this line…"
          />
          <div>
            <Button type="submit" size="compact" disabled={commentBusy || !inlineCommentDraft.trim()}>
              {commentBusy ? "Posting…" : "Post internal line comment"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  function renderAnchoredComments(line: ParsedDiffLine, side: DiffLineSide) {
    const num = side === "LEFT" ? line.oldLine : line.newLine;
    if (!num) return null;
    const key = `${side}:${num}`;
    const matched = commentsByLine.get(key) ?? [];
    const composer = renderInlineComposer(key);
    if (matched.length === 0 && !composer) return null;
    return (
      <div className="diff-inline-thread-wrap">
        {matched.map((c) => (
          <div key={c.id} className="diff-inline-thread-item">
            <div className="inline-actions" style={{ justifyContent: "space-between", gap: ".5rem" }}>
              <span className="comment-meta">
                <strong>{c.author?.name || c.author?.email || "Member"}</strong> · line {c.lineNumber}{" "}
                ({c.lineSide === "LEFT" ? "old" : "new"}) · {formatDateTime(c.createdAt)}
                {c.status === "RESOLVED" ? " · Resolved" : ""}
                {c.isOutdated ? " · Older commit" : ""}
              </span>
            </div>
            <p className="comment-body" style={{ marginTop: ".25rem" }}>
              {c.body}
            </p>
          </div>
        ))}
        {composer}
      </div>
    );
  }

  return (
    <section
      id={`diff-file-${encodeURIComponent(file.filename)}`}
      className="diff-file-card"
      aria-label={`Diff for ${file.filename}`}
    >
      <header className="diff-file-header">
        <div className="inline-actions" style={{ gap: ".55rem", minWidth: 0 }}>
          <button
            type="button"
            className="icon-action-btn"
            aria-label={collapsed ? `Expand ${file.filename}` : `Collapse ${file.filename}`}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>
          <span className={cls}>
            <Icon size={12} aria-hidden="true" /> {label}
          </span>
          <code className="diff-file-path">
            {file.previousFilename ? `${file.previousFilename} → ${file.filename}` : file.filename}
          </code>
        </div>

        <div className="inline-actions" style={{ gap: ".6rem" }}>
          <span className="diff-stat-add">+{file.additions}</span>
          <span className="diff-stat-del">-{file.deletions}</span>
          <a
            href={githubFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-action-link inline-actions"
            style={{ gap: ".25rem" }}
          >
            GitHub <ExternalLink size={12} />
          </a>
        </div>
      </header>

      {!collapsed && (
        <>
          {fileLevelComments.length > 0 && (
            <div className="diff-inline-thread-wrap">
              {fileLevelComments.map((c) => (
                <div key={c.id} className="diff-inline-thread-item">
                  <span className="comment-meta">
                    <strong>{c.author?.name || c.author?.email || "Member"}</strong> · File comment ·{" "}
                    {formatDateTime(c.createdAt)}
                  </span>
                  <p className="comment-body" style={{ marginTop: ".25rem" }}>
                    {c.body}
                  </p>
                </div>
              ))}
            </div>
          )}

          {file.isBinary ? (
            <div className="diff-special-state">
              <p>Binary file or non-text asset changed. Inline text diff is not available.</p>
              <a
                href={githubFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action-link inline-actions"
                style={{ gap: ".3rem" }}
              >
                Open file on GitHub <ExternalLink size={13} />
              </a>
            </div>
          ) : file.isTruncated || !file.patch ? (
            <div className="diff-special-state">
              <p>
                {file.status === "renamed" && file.changes === 0
                  ? "File renamed without content modifications."
                  : "GitHub omitted or truncated this patch because it exceeds response size limits."}
              </p>
              <a
                href={githubFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-action-link inline-actions"
                style={{ gap: ".3rem" }}
              >
                View full diff on GitHub <ExternalLink size={13} />
              </a>
            </div>
          ) : file.isLarge && !largeExpanded ? (
            <div className="diff-special-state">
              <p>
                Large diff hidden by default for responsiveness ({file.lineCount} patch lines,{" "}
                {file.changes} changes).
              </p>
              <div className="inline-actions" style={{ gap: ".65rem" }}>
                <Button type="button" variant="secondary" size="compact" onClick={onExpandLarge}>
                  Load diff inline
                </Button>
                <a
                  href={githubFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-action-link inline-actions"
                  style={{ gap: ".3rem" }}
                >
                  Open on GitHub <ExternalLink size={13} />
                </a>
              </div>
            </div>
          ) : viewMode === "unified" ? (
            <div className="diff-scroll-wrap">
              <table className="diff-table">
                <tbody>
                  {visibleLines.map((line, idx) => {
                    if (line.kind === "hunk" || line.kind === "note") {
                      return (
                        <tr key={`${file.filename}-h-${idx}`} className="diff-row-hunk">
                          <td className="diff-ln" />
                          <td className="diff-ln" />
                          <td className="diff-code-cell">{line.content}</td>
                        </tr>
                      );
                    }
                    const side: DiffLineSide = line.kind === "del" ? "LEFT" : "RIGHT";
                    const targetLine = side === "LEFT" ? line.oldLine : line.newLine;
                    const rowCls =
                      line.kind === "add"
                        ? "diff-row-add"
                        : line.kind === "del"
                          ? "diff-row-del"
                          : "diff-row-ctx";
                    const prefix = line.kind === "add" ? "+" : line.kind === "del" ? "-" : " ";
                    const threadNode = renderAnchoredComments(line, side);
                    return (
                      <tr key={`${file.filename}-l-${idx}`} className={rowCls}>
                        <td className="diff-ln">{line.oldLine ?? ""}</td>
                        <td className="diff-ln">
                          <div className="diff-ln-action">
                            <span>{line.newLine ?? ""}</span>
                            {canReview && targetLine !== null && (
                              <button
                                type="button"
                                className="diff-add-comment-btn"
                                title={`Comment on line ${targetLine}`}
                                aria-label={`Comment on ${file.filename} line ${targetLine}`}
                                onClick={() =>
                                  onSelectLineAnchor({
                                    filePath: file.filename,
                                    lineNumber: targetLine,
                                    lineSide: side,
                                  })
                                }
                              >
                                <MessageSquarePlus size={12} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="diff-code-cell">
                          <div className="diff-code-text">
                            <span className="diff-prefix">{prefix}</span>
                            <span>{line.content || " "}</span>
                          </div>
                          {threadNode}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="diff-scroll-wrap">
              <table className="diff-table diff-table-split">
                <tbody>
                  {splitRows.map((row, idx) => {
                    if (row.kind === "hunk" || row.kind === "note") {
                      return (
                        <tr key={`${file.filename}-sh-${idx}`} className="diff-row-hunk">
                          <td colSpan={4} className="diff-code-cell">
                            {row.hunkHeader}
                          </td>
                        </tr>
                      );
                    }
                    const left = row.left ?? null;
                    const right = row.right ?? null;
                    return (
                      <tr key={`${file.filename}-sp-${idx}`}>
                        <td
                          className={`diff-ln ${left?.kind === "del" ? "diff-cell-del" : ""}`}
                        >
                          <div className="diff-ln-action">
                            <span>{left?.oldLine ?? ""}</span>
                            {canReview && left?.oldLine && (
                              <button
                                type="button"
                                className="diff-add-comment-btn"
                                aria-label={`Comment on old line ${left.oldLine}`}
                                onClick={() =>
                                  onSelectLineAnchor({
                                    filePath: file.filename,
                                    lineNumber: left.oldLine!,
                                    lineSide: "LEFT",
                                  })
                                }
                              >
                                <MessageSquarePlus size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td
                          className={`diff-code-cell ${
                            left?.kind === "del" ? "diff-cell-del" : left ? "" : "diff-cell-empty"
                          }`}
                        >
                          <div className="diff-code-text">{left ? left.content || " " : ""}</div>
                          {left ? renderAnchoredComments(left, "LEFT") : null}
                        </td>
                        <td
                          className={`diff-ln ${right?.kind === "add" ? "diff-cell-add" : ""}`}
                        >
                          <div className="diff-ln-action">
                            <span>{right?.newLine ?? ""}</span>
                            {canReview && right?.newLine && (
                              <button
                                type="button"
                                className="diff-add-comment-btn"
                                aria-label={`Comment on new line ${right.newLine}`}
                                onClick={() =>
                                  onSelectLineAnchor({
                                    filePath: file.filename,
                                    lineNumber: right.newLine!,
                                    lineSide: "RIGHT",
                                  })
                                }
                              >
                                <MessageSquarePlus size={11} />
                              </button>
                            )}
                          </div>
                        </td>
                        <td
                          className={`diff-code-cell ${
                            right?.kind === "add" ? "diff-cell-add" : right ? "" : "diff-cell-empty"
                          }`}
                        >
                          <div className="diff-code-text">{right ? right.content || " " : ""}</div>
                          {right && right !== left ? renderAnchoredComments(right, "RIGHT") : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {hasMoreLines && (
            <div className="diff-load-more">
              <Button type="button" variant="secondary" size="compact" onClick={onShowMoreLines}>
                Show remaining {parsedLines.length - visibleLines.length} lines
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
