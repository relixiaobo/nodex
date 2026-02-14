export interface TextRange {
  from: number;
  to: number;
}

/**
 * Minimal editor bridge used by OutlinerItem for trigger cleanup and inline-reference insertion.
 * Offsets are 0-based text offsets in the editor's current text content.
 */
export interface NodeEditorHandle {
  getText(): string;
  getHTML(): string;
  getCaretOffset(): number | null;
  setPlainText(text: string, caretOffset?: number): void;
  deleteTextRange(range: TextRange): void;
  replaceTextRangeWithInlineRef(range: TextRange, nodeId: string, label: string): void;
  focusToEnd(): void;
}
