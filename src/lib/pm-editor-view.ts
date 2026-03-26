import { toggleMark } from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { marksToDoc } from './pm-doc-utils.js';

export function isEditorViewAlive(view: EditorView | null | undefined): view is EditorView {
  return !!view && !view.isDestroyed;
}

function clampPos(view: EditorView, pos: number): number {
  const maxPos = view.state.doc.content.size - 1;
  return Math.max(1, Math.min(pos, maxPos));
}

function clampDocPos(docSize: number, pos: number): number {
  const maxPos = Math.max(1, docSize - 1);
  return Math.max(1, Math.min(pos, maxPos));
}

function normalizeRange(view: EditorView, from: number, to: number): { from: number; to: number } {
  const safeFrom = clampPos(view, from);
  const safeTo = clampPos(view, to);
  return safeFrom <= safeTo
    ? { from: safeFrom, to: safeTo }
    : { from: safeTo, to: safeFrom };
}

export function deleteEditorRange(view: EditorView, from: number, to: number): void {
  const range = normalizeRange(view, from, to);
  if (range.from === range.to) return;

  let tr = view.state.tr.delete(range.from, range.to);
  tr = tr.setSelection(TextSelection.create(tr.doc, range.from));
  view.dispatch(tr);
  view.focus();
}

export function replaceEditorRangeWithText(view: EditorView, from: number, to: number, text: string): void {
  const range = normalizeRange(view, from, to);

  let tr = view.state.tr.delete(range.from, range.to);
  let cursorPos = range.from;

  if (text) {
    tr = tr.insertText(text, range.from);
    cursorPos = range.from + text.length;
  }

  tr = tr.setSelection(TextSelection.create(tr.doc, clampDocPos(tr.doc.content.size, cursorPos)));
  view.dispatch(tr);
  view.focus();
}

export function replaceEditorRangeWithInlineRef(
  view: EditorView,
  from: number,
  to: number,
  targetNodeId: string,
  displayName: string,
): void {
  const range = normalizeRange(view, from, to);
  const inlineRefNode = view.state.schema.nodes.inlineReference.create({
    targetNodeId,
    displayName,
  });

  let tr = view.state.tr.delete(range.from, range.to);
  tr = tr.insert(range.from, inlineRefNode);
  const afterRef = range.from + inlineRefNode.nodeSize;
  tr = tr.insertText(' ', afterRef);
  tr = tr.setSelection(TextSelection.create(tr.doc, afterRef + 1));
  view.dispatch(tr);
  view.focus();
}

export function toggleHeadingMark(view: EditorView): boolean {
  return toggleMark(view.state.schema.marks.headingMark)(view.state, view.dispatch, view);
}

export function setEditorPlainTextContent(view: EditorView, text: string): void {
  const nextDoc = marksToDoc(text, [], []);
  let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
  tr = tr.setMeta('addToHistory', false);
  const nextPos = Math.max(1, tr.doc.content.size - 1);
  tr = tr.setSelection(TextSelection.create(tr.doc, nextPos));
  view.dispatch(tr);
}

export function setEditorSelection(view: EditorView, from: number, to: number): void {
  const range = normalizeRange(view, from, to);
  const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, range.from, range.to));
  view.dispatch(tr);
}
