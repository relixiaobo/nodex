/**
 * Lightweight per-node contentEditable editor (TipTap-free).
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type KeyboardEvent as ReactKeyboardEvent,
  type MutableRefObject,
} from 'react';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { getPrimaryShortcutKey, getShortcutKeys, matchesShortcutEvent } from '../../lib/shortcut-registry';
import {
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEnterIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../lib/node-editor-shortcuts.js';
import type { NodeEditorHandle, TextRange } from './editor-handle';

const KEY_EDITOR_ENTER = getPrimaryShortcutKey('editor.enter', 'Enter');
const KEY_EDITOR_INDENT = getPrimaryShortcutKey('editor.indent', 'Tab');
const KEY_EDITOR_OUTDENT = getPrimaryShortcutKey('editor.outdent', 'Shift-Tab');
const KEY_EDITOR_BACKSPACE = getPrimaryShortcutKey('editor.backspace_empty', 'Backspace');
const KEY_EDITOR_ARROW_UP = getPrimaryShortcutKey('editor.arrow_up', 'ArrowUp');
const KEY_EDITOR_ARROW_DOWN = getPrimaryShortcutKey('editor.arrow_down', 'ArrowDown');
const KEY_EDITOR_ESCAPE = getPrimaryShortcutKey('editor.escape', 'Escape');
const KEY_EDITOR_DROPDOWN_FORCE_CREATE = getPrimaryShortcutKey('editor.dropdown_force_create', 'Mod-Enter');
const KEY_EDITOR_MOVE_UP = getPrimaryShortcutKey('editor.move_up', 'Mod-Shift-ArrowUp');
const KEY_EDITOR_MOVE_DOWN = getPrimaryShortcutKey('editor.move_down', 'Mod-Shift-ArrowDown');
const [KEY_EDITOR_EDIT_DESC_PRIMARY, KEY_EDITOR_EDIT_DESC_SECONDARY] = getShortcutKeys(
  'editor.edit_description',
  ['Mod-i', 'Ctrl-i'],
);

interface NodeEditorProps {
  nodeId: string;
  parentId: string;
  initialContent: string;
  onBlur: () => void;
  onEnter: (afterContent?: string) => void;
  onBackspaceAtStart?: () => boolean;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => boolean;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHashTag?: (query: string, from: number, to: number) => void;
  onHashTagDeactivate?: () => void;
  editorRef?: MutableRefObject<NodeEditorHandle | null>;
  hashTagActive?: boolean;
  onHashTagConfirm?: () => void;
  onHashTagNavDown?: () => void;
  onHashTagNavUp?: () => void;
  onHashTagCreate?: () => void;
  onHashTagClose?: () => void;
  onFieldTriggerFire?: () => void;
  onReference?: (query: string, from: number, to: number) => void;
  onReferenceDeactivate?: () => void;
  referenceActive?: boolean;
  onReferenceConfirm?: () => void;
  onReferenceNavDown?: () => void;
  onReferenceNavUp?: () => void;
  onReferenceCreate?: () => void;
  onReferenceClose?: () => void;
  onDescriptionEdit?: () => void;
  onToggleDone?: () => void;
  onInlineReferenceClick?: (refNodeId: string) => void;
}

function normalizeEditorHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  const div = document.createElement('div');
  div.innerHTML = trimmed;
  const hasInlineRef = !!div.querySelector('[data-inlineref-node]');
  const text = (div.textContent ?? '').replace(/\u200B/g, '').trim();
  if (!hasInlineRef && text.length === 0) return '';
  return trimmed;
}

function getSelectionRangeWithin(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return range;
}

function getCaretOffset(root: HTMLElement): number | null {
  const range = getSelectionRangeWithin(root);
  if (!range) return null;
  const pre = range.cloneRange();
  pre.selectNodeContents(root);
  pre.setEnd(range.startContainer, range.startOffset);
  return pre.toString().length;
}

function resolvePositionByTextOffset(root: HTMLElement, offset: number): { node: Node; offset: number } {
  const target = Math.max(0, offset);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = target;
  let current = walker.nextNode();

  while (current) {
    const textNode = current as Text;
    const len = textNode.nodeValue?.length ?? 0;
    if (remaining <= len) {
      return { node: textNode, offset: remaining };
    }
    remaining -= len;
    current = walker.nextNode();
  }

  return { node: root, offset: root.childNodes.length };
}

function setCaretByTextOffset(root: HTMLElement, offset: number): void {
  const pos = resolvePositionByTextOffset(root, offset);
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function createRangeFromTextOffsets(root: HTMLElement, range: TextRange): Range | null {
  const textLength = (root.textContent ?? '').length;
  const from = Math.max(0, Math.min(range.from, textLength));
  const to = Math.max(from, Math.min(range.to, textLength));

  const startPos = resolvePositionByTextOffset(root, from);
  const endPos = resolvePositionByTextOffset(root, to);

  const domRange = document.createRange();
  try {
    domRange.setStart(startPos.node, startPos.offset);
    domRange.setEnd(endPos.node, endPos.offset);
  } catch {
    return null;
  }
  return domRange;
}

function insertInlineRefAtRange(range: Range, nodeId: string, label: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.setAttribute('data-inlineref-node', nodeId);
  span.className = 'inline-ref';
  span.contentEditable = 'false';
  span.textContent = label;
  range.insertNode(span);
  return span;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function NodeEditor({
  nodeId,
  parentId,
  initialContent,
  onBlur,
  onEnter,
  onBackspaceAtStart,
  onIndent,
  onOutdent,
  onDelete,
  onArrowUp,
  onArrowDown,
  onMoveUp,
  onMoveDown,
  onHashTag,
  onHashTagDeactivate,
  editorRef,
  hashTagActive,
  onHashTagConfirm,
  onHashTagNavDown,
  onHashTagNavUp,
  onHashTagCreate,
  onHashTagClose,
  onFieldTriggerFire,
  onReference,
  onReferenceDeactivate,
  referenceActive,
  onReferenceConfirm,
  onReferenceNavDown,
  onReferenceNavUp,
  onReferenceCreate,
  onReferenceClose,
  onDescriptionEdit,
  onToggleDone,
  onInlineReferenceClick,
}: NodeEditorProps) {
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const setNodeNameLocal = useNodeStore((s) => s.setNodeNameLocal);
  const userId = useWorkspaceStore((s) => s.userId);
  const focusClickCoords = useUIStore((s) => s.focusClickCoords);
  const setFocusClickCoords = useUIStore((s) => s.setFocusClickCoords);

  const savedRef = useRef(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const latestHtmlRef = useRef<string>(normalizeEditorHtml(initialContent));
  const composingRef = useRef(false);

  const initialClickOffsetRef = useRef<number | null>(null);
  if (initialClickOffsetRef.current === null) {
    const info = useUIStore.getState().focusClickCoords;
    if (info && info.nodeId === nodeId && info.parentId === parentId) {
      initialClickOffsetRef.current = info.textOffset;
    }
  }

  // Mutable ref updated every render — avoids stale closures in event handlers.
  const noop = (() => {}) as () => void;
  const callbacksRef = useRef<{
    onEnter: typeof onEnter;
    onBackspaceAtStart: NonNullable<typeof onBackspaceAtStart>;
    onIndent: typeof onIndent;
    onOutdent: typeof onOutdent;
    onDelete: typeof onDelete;
    onArrowUp: typeof onArrowUp;
    onArrowDown: typeof onArrowDown;
    onMoveUp: typeof onMoveUp;
    onMoveDown: typeof onMoveDown;
    setNodeNameLocal: typeof setNodeNameLocal;
    nodeId: string;
    hashTagActive: boolean;
    onHashTagConfirm: () => void;
    onHashTagNavDown: () => void;
    onHashTagNavUp: () => void;
    onHashTagCreate: () => void;
    onHashTagClose: () => void;
    referenceActive: boolean;
    onReferenceConfirm: () => void;
    onReferenceNavDown: () => void;
    onReferenceNavUp: () => void;
    onReferenceCreate: () => void;
    onReferenceClose: () => void;
    onDescriptionEdit: () => void;
    onToggleDone: () => void;
    onInlineReferenceClick: (refNodeId: string) => void;
    onFieldTriggerFire: () => void;
    onHashTag: (query: string, from: number, to: number) => void;
    onHashTagDeactivate: () => void;
    onReference: (query: string, from: number, to: number) => void;
    onReferenceDeactivate: () => void;
  }>(null!);
  callbacksRef.current = {
    onEnter,
    onBackspaceAtStart: onBackspaceAtStart ?? (() => false),
    onIndent,
    onOutdent,
    onDelete,
    onArrowUp,
    onArrowDown,
    onMoveUp,
    onMoveDown,
    setNodeNameLocal,
    nodeId,
    hashTagActive: hashTagActive ?? false,
    onHashTagConfirm: onHashTagConfirm ?? noop,
    onHashTagNavDown: onHashTagNavDown ?? noop,
    onHashTagNavUp: onHashTagNavUp ?? noop,
    onHashTagCreate: onHashTagCreate ?? noop,
    onHashTagClose: onHashTagClose ?? noop,
    referenceActive: referenceActive ?? false,
    onReferenceConfirm: onReferenceConfirm ?? noop,
    onReferenceNavDown: onReferenceNavDown ?? noop,
    onReferenceNavUp: onReferenceNavUp ?? noop,
    onReferenceCreate: onReferenceCreate ?? noop,
    onReferenceClose: onReferenceClose ?? noop,
    onDescriptionEdit: onDescriptionEdit ?? noop,
    onToggleDone: onToggleDone ?? noop,
    onInlineReferenceClick: onInlineReferenceClick ?? noop,
    onFieldTriggerFire: onFieldTriggerFire ?? noop,
    onHashTag: onHashTag ?? noop,
    onHashTagDeactivate: onHashTagDeactivate ?? noop,
    onReference: onReference ?? noop,
    onReferenceDeactivate: onReferenceDeactivate ?? noop,
  };

  const triggerStateRef = useRef({
    hashActive: false,
    referenceActive: false,
    fieldFired: false,
    hasUserEdited: false,
  });

  const readHtml = useCallback((): string => {
    const root = rootRef.current;
    if (!root) return latestHtmlRef.current;
    const cleaned = normalizeEditorHtml(root.innerHTML);
    latestHtmlRef.current = cleaned;
    return cleaned;
  }, []);

  const syncLocalName = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const cleaned = normalizeEditorHtml(root.innerHTML);
    latestHtmlRef.current = cleaned;
    callbacksRef.current.setNodeNameLocal(callbacksRef.current.nodeId, cleaned);
  }, []);

  const saveContent = useCallback(
    (html: string) => {
      if (savedRef.current) return;
      savedRef.current = true;
      const cleaned = normalizeEditorHtml(html);
      if (cleaned !== initialContent && userId) {
        updateNodeName(nodeId, cleaned, userId);
      }
    },
    [initialContent, nodeId, updateNodeName, userId],
  );

  const evaluateTriggers = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const text = root.textContent ?? '';
    const caret = getCaretOffset(root);
    if (caret === null) return;

    const state = triggerStateRef.current;
    const textBefore = text.slice(0, caret);

    const hashMatch = textBefore.match(/#([^\s#@]*)$/u);
    if (hashMatch && (state.hasUserEdited || state.hashActive)) {
      state.hashActive = true;
      const query = hashMatch[1];
      callbacksRef.current.onHashTag(query, caret - hashMatch[0].length, caret);
    } else if (state.hashActive) {
      state.hashActive = false;
      callbacksRef.current.onHashTagDeactivate();
    }

    const refMatch = textBefore.match(/@([^\s]*)$/);
    if (refMatch && (state.hasUserEdited || state.referenceActive)) {
      state.referenceActive = true;
      const query = refMatch[1];
      callbacksRef.current.onReference(query, caret - refMatch[0].length, caret);
    } else if (state.referenceActive) {
      state.referenceActive = false;
      callbacksRef.current.onReferenceDeactivate();
    }

    if (state.hasUserEdited && text === '>' && caret === 1) {
      if (!state.fieldFired) {
        state.fieldFired = true;
        callbacksRef.current.onFieldTriggerFire();
      }
    } else {
      state.fieldFired = false;
    }
  }, []);

  const runForceCreateShortcut = useCallback(() => {
    const intent = resolveNodeEditorForceCreateIntent(
      triggerStateRef.current.referenceActive,
      triggerStateRef.current.hashActive,
    );
    if (intent === 'reference_create') {
      callbacksRef.current.onReferenceCreate();
      return true;
    }
    if (intent === 'hashtag_create') {
      callbacksRef.current.onHashTagCreate();
      return true;
    }
    callbacksRef.current.onToggleDone();
    return true;
  }, []);

  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    // Use only the event-level isComposing flag — composingRef.current can be
    // stale-true (macOS triggers compositionStart on first keystroke in fresh
    // contentEditable; Enter before compositionEnd would be wrongly blocked).
    if (e.nativeEvent.isComposing || e.key === 'Process') return;

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_DROPDOWN_FORCE_CREATE)) {
      e.preventDefault();
      runForceCreateShortcut();
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_ENTER)) {
      e.preventDefault();

      // Read trigger state from mutable ref (updated synchronously in
      // evaluateTriggers) rather than callbacksRef (updated via React prop
      // after render). This avoids a one-render-cycle lag where the prop is
      // still false when the user presses Enter immediately after typing @/#.
      const intent = resolveNodeEditorEnterIntent({
        referenceActive: triggerStateRef.current.referenceActive,
        hashTagActive: triggerStateRef.current.hashActive,
      });

      if (intent === 'reference_confirm') {
        callbacksRef.current.onReferenceConfirm();
        return;
      }
      if (intent === 'hashtag_confirm') {
        callbacksRef.current.onHashTagConfirm();
        return;
      }

      const root = rootRef.current;
      if (!root) {
        callbacksRef.current.onEnter();
        return;
      }

      const totalLen = (root.textContent ?? '').length;
      const caret = getCaretOffset(root) ?? totalLen;

      if (caret >= totalLen) {
        saveContent(readHtml());
        callbacksRef.current.onEnter();
        return;
      }

      const range = createRangeFromTextOffsets(root, { from: caret, to: totalLen });
      if (!range) {
        saveContent(readHtml());
        callbacksRef.current.onEnter();
        return;
      }

      const fragment = range.cloneContents();
      const tmp = document.createElement('div');
      tmp.appendChild(fragment);
      const afterHtml = normalizeEditorHtml(tmp.innerHTML);

      range.deleteContents();
      const beforeHtml = readHtml();
      saveContent(beforeHtml);
      callbacksRef.current.onEnter(afterHtml);
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_INDENT)) {
      e.preventDefault();
      callbacksRef.current.onIndent();
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_OUTDENT)) {
      e.preventDefault();
      callbacksRef.current.onOutdent();
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_BACKSPACE)) {
      const root = rootRef.current;
      const selRange = root ? getSelectionRangeWithin(root) : null;
      const hasSelection = !!selRange && !selRange.collapsed;
      const caret = root ? getCaretOffset(root) : null;
      if (!hasSelection && (caret ?? 0) <= 0) {
        const merged = callbacksRef.current.onBackspaceAtStart();
        if (merged) {
          e.preventDefault();
          return;
        }
      }
      const rawText = root?.textContent ?? '';
      const isEmpty = !rawText.replace(/\u200B/g, '').trim().length;
      if (isEmpty) {
        callbacksRef.current.setNodeNameLocal(callbacksRef.current.nodeId, '');
        saveContent(readHtml());
        const deleted = callbacksRef.current.onDelete();
        if (deleted) e.preventDefault();
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_ARROW_UP)) {
      const root = rootRef.current;
      const caret = root ? getCaretOffset(root) : null;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: triggerStateRef.current.referenceActive,
        hashTagActive: triggerStateRef.current.hashActive,
        isAtBoundary: (caret ?? 0) <= 0,
      });
      if (intent === 'reference_nav') {
        e.preventDefault();
        callbacksRef.current.onReferenceNavUp();
        return;
      }
      if (intent === 'hashtag_nav') {
        e.preventDefault();
        callbacksRef.current.onHashTagNavUp();
        return;
      }
      if (intent === 'navigate_outliner') {
        e.preventDefault();
        callbacksRef.current.onArrowUp();
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_ARROW_DOWN)) {
      const root = rootRef.current;
      const totalLen = (root?.textContent ?? '').length;
      const caret = root ? getCaretOffset(root) : null;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: triggerStateRef.current.referenceActive,
        hashTagActive: triggerStateRef.current.hashActive,
        isAtBoundary: (caret ?? totalLen) >= totalLen,
      });
      if (intent === 'reference_nav') {
        e.preventDefault();
        callbacksRef.current.onReferenceNavDown();
        return;
      }
      if (intent === 'hashtag_nav') {
        e.preventDefault();
        callbacksRef.current.onHashTagNavDown();
        return;
      }
      if (intent === 'navigate_outliner') {
        e.preventDefault();
        callbacksRef.current.onArrowDown();
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_ESCAPE)) {
      const intent = resolveNodeEditorEscapeIntent(
        triggerStateRef.current.referenceActive,
        triggerStateRef.current.hashActive,
      );
      if (intent === 'reference_close') {
        e.preventDefault();
        callbacksRef.current.onReferenceClose();
        return;
      }
      if (intent === 'hashtag_close') {
        e.preventDefault();
        callbacksRef.current.onHashTagClose();
      }
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_MOVE_UP)) {
      e.preventDefault();
      callbacksRef.current.onMoveUp();
      return;
    }

    if (matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_MOVE_DOWN)) {
      e.preventDefault();
      callbacksRef.current.onMoveDown();
      return;
    }

    if (
      matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_EDIT_DESC_PRIMARY)
      || (KEY_EDITOR_EDIT_DESC_SECONDARY && matchesShortcutEvent(e.nativeEvent, KEY_EDITOR_EDIT_DESC_SECONDARY))
    ) {
      e.preventDefault();
      callbacksRef.current.onDescriptionEdit();
    }
  }, [readHtml, runForceCreateShortcut, saveContent]);

  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    const inputEvent = e.nativeEvent as InputEvent;
    if (composingRef.current || inputEvent.isComposing) return;
    savedRef.current = false;
    triggerStateRef.current.hasUserEdited = true;
    syncLocalName();
    evaluateTriggers();
  }, [evaluateTriggers, syncLocalName]);

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false;
    savedRef.current = false;
    triggerStateRef.current.hasUserEdited = true;
    syncLocalName();
    evaluateTriggers();
  }, [evaluateTriggers, syncLocalName]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const refEl = target.closest('[data-inlineref-node]') as HTMLElement | null;
    if (!refEl) return;
    const refId = refEl.getAttribute('data-inlineref-node');
    if (!refId) return;
    e.preventDefault();
    e.stopPropagation();
    callbacksRef.current.onInlineReferenceClick(refId);
  }, []);

  const handleBlur = useCallback(() => {
    if (!savedRef.current) {
      saveContent(readHtml());
    }
    onBlur();
  }, [onBlur, readHtml, saveContent]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    savedRef.current = false;
    triggerStateRef.current = {
      hashActive: false,
      referenceActive: false,
      fieldFired: false,
      hasUserEdited: false,
    };

    root.innerHTML = initialContent || '';
    latestHtmlRef.current = normalizeEditorHtml(root.innerHTML);
    root.focus();

    const initialClickOffset = initialClickOffsetRef.current;
    if (initialClickOffset !== null) {
      setCaretByTextOffset(root, initialClickOffset);
      initialClickOffsetRef.current = null;
    } else {
      setCaretByTextOffset(root, (root.textContent ?? '').length);
    }

    const clickInfo = useUIStore.getState().focusClickCoords;
    if (clickInfo && clickInfo.nodeId === nodeId && clickInfo.parentId === parentId) {
      useUIStore.getState().setFocusClickCoords(null);
    }

    if (editorRef) {
      editorRef.current = {
        getText: () => root.textContent ?? '',
        getHTML: () => normalizeEditorHtml(root.innerHTML),
        getCaretOffset: () => getCaretOffset(root),
        setPlainText: (text, caretOffset) => {
          root.focus();
          root.textContent = text;
          const offset = caretOffset ?? text.length;
          setCaretByTextOffset(root, offset);
          triggerStateRef.current.hasUserEdited = true;
          syncLocalName();
          evaluateTriggers();
        },
        deleteTextRange: (range) => {
          root.focus();
          const before = normalizeEditorHtml(root.innerHTML);
          const domRange = createRangeFromTextOffsets(root, range);
          if (domRange) {
            domRange.deleteContents();
          } else {
            const fullText = root.textContent ?? '';
            const from = Math.max(0, Math.min(range.from, fullText.length));
            const to = Math.max(from, Math.min(range.to, fullText.length));
            root.textContent = fullText.slice(0, from) + fullText.slice(to);
          }
          if (normalizeEditorHtml(root.innerHTML) === before) {
            const fullText = root.textContent ?? '';
            const from = Math.max(0, Math.min(range.from, fullText.length));
            const to = Math.max(from, Math.min(range.to, fullText.length));
            root.textContent = fullText.slice(0, from) + fullText.slice(to);
          }
          const collapsedAt = range.from;
          setCaretByTextOffset(root, collapsedAt);
          triggerStateRef.current.hasUserEdited = true;
          syncLocalName();
          evaluateTriggers();
        },
        replaceTextRangeWithInlineRef: (range, refNodeId, label) => {
          root.focus();
          const domRange = createRangeFromTextOffsets(root, range);
          let span: HTMLSpanElement | null = null;
          if (domRange) {
            domRange.deleteContents();
            span = insertInlineRefAtRange(domRange, refNodeId, label);
          } else {
            const fullText = root.textContent ?? '';
            const from = Math.max(0, Math.min(range.from, fullText.length));
            const to = Math.max(from, Math.min(range.to, fullText.length));
            root.innerHTML =
              `${escapeHtml(fullText.slice(0, from))}`
              + `<span data-inlineref-node="${refNodeId}" data-inline-temp="1" class="inline-ref" contenteditable="false">${escapeHtml(label)}</span>`
              + `${escapeHtml(fullText.slice(to))}`;
            span = root.querySelector('[data-inline-temp=\"1\"]') as HTMLSpanElement | null;
            if (span) span.removeAttribute('data-inline-temp');
          }
          if (!span) return;
          const after = document.createRange();
          after.setStartAfter(span);
          after.collapse(true);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(after);
          triggerStateRef.current.hasUserEdited = true;
          syncLocalName();
          evaluateTriggers();
        },
        focusToEnd: () => {
          root.focus();
          setCaretByTextOffset(root, (root.textContent ?? '').length);
        },
      };
    }

    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editorRef, evaluateTriggers, nodeId, parentId, syncLocalName]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !focusClickCoords) return;
    if (focusClickCoords.nodeId !== nodeId || focusClickCoords.parentId !== parentId) return;
    root.focus();
    setCaretByTextOffset(root, focusClickCoords.textOffset);
    setFocusClickCoords(null);
  }, [focusClickCoords, nodeId, parentId, setFocusClickCoords]);

  const handleKeyUp = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current || e.nativeEvent.isComposing || e.key === 'Process') return;
    evaluateTriggers();
  }, [evaluateTriggers]);

  useEffect(() => {
    return () => {
      if (!savedRef.current) {
        saveContent(readHtml());
      }
      if (editorRef) editorRef.current = null;
    };
  }, [editorRef, readHtml, saveContent]);

  return (
    <div className="editor-inline">
      <div
        ref={rootRef}
        className="node-editor outline-none text-sm leading-[21px] min-w-[1px]"
        contentEditable
        suppressContentEditableWarning
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        onMouseDown={handleMouseDown}
        onKeyUp={handleKeyUp}
        onMouseUp={evaluateTriggers}
        onBlur={handleBlur}
      />
    </div>
  );
}
