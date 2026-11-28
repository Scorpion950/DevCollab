"use client";

import * as Y from "yjs";
import { createMutex } from "lib0/mutex";
import type { Awareness } from "y-protocols/awareness";
import type {
  editor as MonacoEditorNs,
  IDisposable,
  ISelection,
  SelectionDirection,
} from "monaco-editor";

export interface MonacoRuntimeApi {
  Range: new (
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number,
  ) => {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  Selection: {
    new (
      selectionStartLineNumber: number,
      selectionStartColumn: number,
      positionLineNumber: number,
      positionColumn: number,
    ): ISelection & {
      startLineNumber: number;
      startColumn: number;
      endLineNumber: number;
      endColumn: number;
    };
    createWithDirection(
      startLineNumber: number,
      startColumn: number,
      endLineNumber: number,
      endColumn: number,
      direction: SelectionDirection,
    ): ISelection;
  };
  SelectionDirection: {
    RTL: SelectionDirection;
  };
}

class RelativeSelection {
  constructor(
    public readonly start: Y.RelativePosition,
    public readonly end: Y.RelativePosition,
    public readonly direction: SelectionDirection,
  ) {}
}

function createRelativeSelection(
  editor: MonacoEditorNs.IStandaloneCodeEditor,
  monacoModel: MonacoEditorNs.ITextModel,
  type: Y.Text,
): RelativeSelection | null {
  const sel = editor.getSelection();
  if (!sel) return null;
  const startPos = sel.getStartPosition();
  const endPos = sel.getEndPosition();
  const start = Y.createRelativePositionFromTypeIndex(type, monacoModel.getOffsetAt(startPos));
  const end = Y.createRelativePositionFromTypeIndex(type, monacoModel.getOffsetAt(endPos));
  return new RelativeSelection(start, end, sel.getDirection());
}

/**
 * Attaches Yjs CRDT synchronization and ephemeral remote awareness cursors
 * directly to an already-mounted Monaco Editor model without bundling a second
 * copy of `monaco-editor/esm`.
 */
export class MonacoYjsBinding {
  private readonly doc: Y.Doc;
  private readonly mux = createMutex();
  private savedSelection: RelativeSelection | null = null;
  private decorations: string[] = [];
  private readonly disposables: IDisposable[] = [];
  private readonly beforeTransactionHandler: () => void;
  private readonly yTextObserver: (event: Y.YTextEvent) => void;
  private readonly rerenderDecorations: () => void;

  constructor(
    private readonly monaco: MonacoRuntimeApi,
    private readonly ytext: Y.Text,
    private readonly monacoModel: MonacoEditorNs.ITextModel,
    private readonly editor: MonacoEditorNs.IStandaloneCodeEditor,
    private readonly awareness: Awareness | null = null,
  ) {
    this.doc = ytext.doc!;

    this.beforeTransactionHandler = () => {
      this.mux(() => {
        if (this.editor.getModel() === this.monacoModel) {
          this.savedSelection = createRelativeSelection(this.editor, this.monacoModel, this.ytext);
        }
      });
    };
    this.doc.on("beforeAllTransactions", this.beforeTransactionHandler);

    this.rerenderDecorations = () => {
      if (!this.awareness || this.editor.getModel() !== this.monacoModel) {
        this.decorations = [];
        return;
      }
      const nextDecorations: MonacoEditorNs.IModelDeltaDecoration[] = [];
      this.awareness.getStates().forEach((state, clientID) => {
        if (
          clientID === this.doc.clientID ||
          !state?.selection?.anchor ||
          !state?.selection?.head
        ) {
          return;
        }
        const anchorAbs = Y.createAbsolutePositionFromRelativePosition(
          state.selection.anchor,
          this.doc,
        );
        const headAbs = Y.createAbsolutePositionFromRelativePosition(
          state.selection.head,
          this.doc,
        );
        if (
          !anchorAbs ||
          !headAbs ||
          anchorAbs.type !== this.ytext ||
          headAbs.type !== this.ytext
        ) {
          return;
        }
        let start;
        let end;
        let afterContentClassName: string | undefined;
        let beforeContentClassName: string | undefined;
        if (anchorAbs.index < headAbs.index) {
          start = this.monacoModel.getPositionAt(anchorAbs.index);
          end = this.monacoModel.getPositionAt(headAbs.index);
          afterContentClassName = `yRemoteSelectionHead yRemoteSelectionHead-${clientID}`;
        } else {
          start = this.monacoModel.getPositionAt(headAbs.index);
          end = this.monacoModel.getPositionAt(anchorAbs.index);
          beforeContentClassName = `yRemoteSelectionHead yRemoteSelectionHead-${clientID}`;
        }
        nextDecorations.push({
          range: new this.monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          options: {
            className: `yRemoteSelection yRemoteSelection-${clientID}`,
            afterContentClassName,
            beforeContentClassName,
          },
        });
      });
      this.decorations = this.editor.deltaDecorations(this.decorations, nextDecorations);
    };

    this.yTextObserver = (event: Y.YTextEvent) => {
      this.mux(() => {
        let index = 0;
        for (const op of event.delta) {
          if (op.retain !== undefined) {
            index += op.retain;
          } else if (typeof op.insert === "string") {
            const pos = this.monacoModel.getPositionAt(index);
            const range = new this.monaco.Selection(
              pos.lineNumber,
              pos.column,
              pos.lineNumber,
              pos.column,
            );
            this.monacoModel.applyEdits([{ range, text: op.insert }]);
            index += op.insert.length;
          } else if (op.delete !== undefined) {
            const pos = this.monacoModel.getPositionAt(index);
            const endPos = this.monacoModel.getPositionAt(index + op.delete);
            const range = new this.monaco.Selection(
              pos.lineNumber,
              pos.column,
              endPos.lineNumber,
              endPos.column,
            );
            this.monacoModel.applyEdits([{ range, text: "" }]);
          }
        }
        if (this.savedSelection) {
          const start = Y.createAbsolutePositionFromRelativePosition(
            this.savedSelection.start,
            this.doc,
          );
          const end = Y.createAbsolutePositionFromRelativePosition(
            this.savedSelection.end,
            this.doc,
          );
          if (start && end && start.type === this.ytext && end.type === this.ytext) {
            const startPos = this.monacoModel.getPositionAt(start.index);
            const endPos = this.monacoModel.getPositionAt(end.index);
            this.editor.setSelection(
              this.monaco.Selection.createWithDirection(
                startPos.lineNumber,
                startPos.column,
                endPos.lineNumber,
                endPos.column,
                this.savedSelection.direction,
              ),
            );
          }
        }
      });
      this.rerenderDecorations();
    };
    this.ytext.observe(this.yTextObserver);

    const currentYVal = this.ytext.toString();
    if (currentYVal && this.monacoModel.getValue() !== currentYVal) {
      this.mux(() => {
        this.monacoModel.setValue(currentYVal);
      });
    }

    this.disposables.push(
      this.monacoModel.onDidChangeContent((event) => {
        this.mux(() => {
          this.doc.transact(() => {
            const changes = [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset);
            for (const change of changes) {
              this.ytext.delete(change.rangeOffset, change.rangeLength);
              this.ytext.insert(change.rangeOffset, change.text);
            }
          }, this);
        });
      }),
      this.monacoModel.onWillDispose(() => this.destroy()),
    );

    if (this.awareness) {
      this.disposables.push(
        this.editor.onDidChangeCursorSelection(() => {
          if (this.editor.getModel() !== this.monacoModel) return;
          const sel = this.editor.getSelection();
          if (!sel) return;
          let anchor = this.monacoModel.getOffsetAt(sel.getStartPosition());
          let head = this.monacoModel.getOffsetAt(sel.getEndPosition());
          if (sel.getDirection() === this.monaco.SelectionDirection.RTL) {
            [anchor, head] = [head, anchor];
          }
          this.awareness?.setLocalStateField("selection", {
            anchor: Y.createRelativePositionFromTypeIndex(this.ytext, anchor),
            head: Y.createRelativePositionFromTypeIndex(this.ytext, head),
          });
        }),
      );
      this.awareness.on("change", this.rerenderDecorations);
    }
  }

  destroy() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
    if (this.decorations.length > 0 && this.editor.getModel() === this.monacoModel) {
      this.decorations = this.editor.deltaDecorations(this.decorations, []);
    }
    this.ytext.unobserve(this.yTextObserver);
    this.doc.off("beforeAllTransactions", this.beforeTransactionHandler);
    this.awareness?.off("change", this.rerenderDecorations);
  }
}
