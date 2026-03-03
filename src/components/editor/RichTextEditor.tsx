import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { commitDoc, redoDoc, undoDoc, hasNode as loroHasNode } from '../../lib/loro-doc.js';
import { useNodeStore } from '../../stores/node-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { getPrimaryShortcutKey, getShortcutKeys } from '../../lib/shortcut-registry.js';
import { isImeComposingEvent } from '../../lib/ime-keyboard.js';
import {
  resolveContentRowArrowIntent as resolveNodeEditorArrowIntent,
  resolveContentRowBackspaceIntent as resolveNodeEditorBackspaceIntent,
  resolveContentRowEnterIntent as resolveNodeEditorEnterIntent,
  resolveContentRowEscapeIntent as resolveNodeEditorEscapeIntent,
  resolveContentRowForceCreateIntent as resolveNodeEditorForceCreateIntent,
} from '../../lib/row-interactions.js';
import type { InlineRefEntry, TextMark } from '../../types/index.js';
import { docToMarks, marksToDoc } from '../../lib/pm-doc-utils.js';
import { isOnlyInlineRef } from '../../lib/tree-utils.js';
import { pmSchema } from './pm-schema.js';
import { FloatingToolbar } from './FloatingToolbar.js';
import { TagSelectorPopover, type TagSelectorResult } from './TagSelectorPopover.js';
import { extractToTaggedNode } from '../../lib/extract-to-tagged-node.js';
import type { HighlightNodeStore } from '../../lib/highlight-service.js';
import { parseMultiLinePaste, type ParsedPasteNode } from '../../lib/paste-parser.js';
import { logPasteDebug, previewMultiline, summarizePasteNodes } from '../../lib/paste-debug.js';
import { parseNodeLinkFromHtml } from '../../lib/node-clipboard.js';

/**
 * Detect whether a string looks like a URL for smart paste.
 * Matches http(s) URLs and common bare domains (e.g. "example.com/path").
 */
function isLikelyUrl(text: string): boolean {
  // Must be a single "word" — no spaces (a pasted URL won't contain spaces)
  if (/\s/.test(text)) return false;
  // Explicit protocol
  if (/^https?:\/\//i.test(text)) {
    try { new URL(text); return true; } catch { return false; }
  }
  // Bare domain: word.tld with optional path (e.g. "github.com/user/repo")
  if (/^[\w-]+\.[\w-]+/.test(text)) {
    try { new URL(`https://${text}`); return true; } catch { return false; }
  }
  return false;
}

const KEY_EDITOR_DROPDOWN_FORCE_CREATE = getPrimaryShortcutKey('editor.dropdown_force_create', 'Mod-Enter');
const KEY_EDITOR_MOVE_UP = getPrimaryShortcutKey('editor.move_up', 'Mod-Shift-ArrowUp');
const KEY_EDITOR_MOVE_DOWN = getPrimaryShortcutKey('editor.move_down', 'Mod-Shift-ArrowDown');
const [KEY_EDITOR_EDIT_DESC_PRIMARY, KEY_EDITOR_EDIT_DESC_SECONDARY] = getShortcutKeys(
  'editor.edit_description',
  ['Ctrl-i'],
);
const META_DEFER_LORO_TEXT_COMMIT = 'nodex:defer-loro-text-commit';

interface TriggerRuntimeState {
  hasUserEdited: boolean;
  hashActive: boolean;
  referenceActive: boolean;
  slashActive: boolean;
  fieldFired: boolean;
}

export interface TriggerAnchorRect {
  left: number;
  top: number;
  bottom: number;
}

interface RichTextEditorProps {
  nodeId: string;
  parentId: string;
  initialText: string;
  initialMarks: TextMark[];
  initialInlineRefs: InlineRefEntry[];
  onBlur: () => void;
  onEnter: (afterContent?: EditorContentPayload) => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => boolean;
  onBackspaceAtStart?: () => boolean;
  onBackspaceAtEndSingleInlineRef?: () => boolean;
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHashTag?: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
  onHashTagDeactivate?: () => void;
  editorRef?: MutableRefObject<EditorView | null>;
  hashTagActive?: boolean;
  onHashTagConfirm?: () => void;
  onHashTagNavDown?: () => void;
  onHashTagNavUp?: () => void;
  onHashTagCreate?: () => void;
  onHashTagClose?: () => void;
  onFieldTriggerFire?: () => void;
  onReference?: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
  onReferenceDeactivate?: () => void;
  referenceActive?: boolean;
  onReferenceConfirm?: () => void;
  onReferenceNavDown?: () => void;
  onReferenceNavUp?: () => void;
  onReferenceCreate?: () => void;
  onReferenceClose?: () => void;
  onSlashCommand?: (query: string, from: number, to: number, anchor?: TriggerAnchorRect) => void;
  onSlashCommandDeactivate?: () => void;
  slashActive?: boolean;
  onSlashConfirm?: () => void;
  onSlashNavDown?: () => void;
  onSlashNavUp?: () => void;
  onSlashClose?: () => void;
  onDescriptionEdit?: () => void;
  onToggleDone?: () => void;
  onEscapeSelect?: () => void;
  onShiftArrow?: (direction: 'up' | 'down') => void;
  onSelectAll?: () => void;
  onPasteMultiLine?: (nodes: ParsedPasteNode[]) => void;
}

export interface EditorContentPayload {
  text: string;
  marks: TextMark[];
  inlineRefs: InlineRefEntry[];
}

function getCaretAnchorRect(view: EditorView, pos: number): TriggerAnchorRect | undefined {
  try {
    const rect = view.coordsAtPos(pos);
    return { left: rect.left, top: rect.top, bottom: rect.bottom };
  } catch {
    return undefined;
  }
}

function marksEqual(a: TextMark[], b: TextMark[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function inlineRefsEqual(a: InlineRefEntry[], b: InlineRefEntry[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function contentEquals(
  textA: string,
  marksA: TextMark[],
  refsA: InlineRefEntry[],
  textB: string,
  marksB: TextMark[],
  refsB: InlineRefEntry[],
): boolean {
  return textA === textB && marksEqual(marksA, marksB) && inlineRefsEqual(refsA, refsB);
}

export function RichTextEditor(props: RichTextEditorProps) {
  const [toolbarTick, setToolbarTick] = useState(0);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const focusRafRef = useRef<number | null>(null);
  const savedRef = useRef(false);
  const isExternalSyncRef = useRef(false);
  const isComposingRef = useRef(false);
  /** Tracks whether Shift was held during the most recent paste-triggering Cmd/Ctrl+V keystroke. */
  const pasteShiftRef = useRef(false);
  const triggerStateRef = useRef<TriggerRuntimeState>({
    hasUserEdited: false,
    hashActive: false,
    referenceActive: false,
    slashActive: false,
    fieldFired: false,
  });

  const propsRef = useRef(props);
  propsRef.current = props;

  // Capture content baseline at editor creation time for change detection.
  // NOT updated by re-renders from updateNodeContent (typing) — only updated
  // when a genuine external sync occurs (e.g., Realtime update from another client).
  const initialContentRef = useRef({
    text: props.initialText,
    marks: props.initialMarks,
    inlineRefs: props.initialInlineRefs,
  });

  const updateNodeContent = useNodeStore((s) => s.updateNodeContent);
  const applyParsedPasteMetadata = useNodeStore((s) => s.applyParsedPasteMetadata);
  const createChildNodesFromPaste = useNodeStore((s) => s.createChildNodesFromPaste);

  const saveContent = useCallback(() => {
    const view = viewRef.current;
    if (!view || savedRef.current) return;

    savedRef.current = true;
    const parsed = docToMarks(view.state.doc);
    const changed = !contentEquals(
      parsed.text,
      parsed.marks,
      parsed.inlineRefs,
      initialContentRef.current.text,
      initialContentRef.current.marks,
      initialContentRef.current.inlineRefs,
    );

    if (changed) {
      updateNodeContent(propsRef.current.nodeId, {
        name: parsed.text,
        marks: parsed.marks,
        inlineRefs: parsed.inlineRefs,
      });
    }
  }, [updateNodeContent]);

  const syncInitialFocus = useCallback((view: EditorView) => {
    if (viewRef.current !== view) return;

    savedRef.current = false;

    if (propsRef.current.editorRef) {
      propsRef.current.editorRef.current = view;
    }

    const clickInfo = useUIStore.getState().focusClickCoords;
    const hasClickCoords = clickInfo && clickInfo.nodeId === propsRef.current.nodeId && clickInfo.parentId === propsRef.current.parentId;

    const pendingInput = useUIStore.getState().pendingInputChar;
    const hasPendingInput = pendingInput && pendingInput.nodeId === propsRef.current.nodeId && pendingInput.parentId === propsRef.current.parentId;

    if (!hasClickCoords && !hasPendingInput) {
      // --- Enter-created editor ---
      // Known issue: CJK IME first-character disruption after Enter.
      // See docs/issues/editor-ime-enter-empty-node.md for details.
      // Use preventScroll: OutlinerItem's useEffect handles scroll-into-view
      // without being affected by CSS scroll-padding (scroll-pb-[40vh]).
      view.dom.focus({ preventScroll: true });
      return;
    }

    // --- Click-created editor (needs cursor placement) ---
    // Give the contenteditable DOM focus immediately so keystrokes arriving
    // before rAF are captured.  We use view.dom.focus() (not view.focus())
    // to avoid selectionToDOM() which would place the cursor at position 0
    // before we can restore the click-based offset.
    if (!view.hasFocus()) {
      view.dom.focus({ preventScroll: true });
    }

    if (focusRafRef.current !== null) {
      cancelAnimationFrame(focusRafRef.current);
    }
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = null;
      if (viewRef.current !== view) return;

      // Full PM focus (including selectionToDOM) now that browser has painted.
      // Use preventScroll to avoid CSS scroll-padding (scroll-pb-[40vh]) interference.
      if (!view.hasFocus()) {
        view.dom.focus({ preventScroll: true });
      }
      if (!view.hasFocus()) return;

      // --- Sync trigger state for TrailingInput-created trigger nodes ---
      // When TrailingInput creates a node with # / @ / /, OutlinerItem opens the
      // dropdown via triggerHint, but the editor's internal triggerStateRef hasn't
      // been activated. Sync the flags here BEFORE cursor restoration so that the
      // dispatchTransaction → runTriggerDetection call sees the correct state and
      // doesn't deactivate the dropdown that triggerHint just opened.
      const ts = triggerStateRef.current;
      if (
        (propsRef.current.hashTagActive && !ts.hashActive) ||
        (propsRef.current.referenceActive && !ts.referenceActive) ||
        (propsRef.current.slashActive && !ts.slashActive)
      ) {
        ts.hasUserEdited = true;
        if (propsRef.current.hashTagActive) ts.hashActive = true;
        if (propsRef.current.referenceActive) ts.referenceActive = true;
        if (propsRef.current.slashActive) ts.slashActive = true;
      }

      // Restore click-based cursor position.
      const ci = useUIStore.getState().focusClickCoords;
      if (ci && ci.nodeId === propsRef.current.nodeId && ci.parentId === propsRef.current.parentId) {
        if (!view.composing) {
          const maxPos = view.state.doc.content.size - 1;
          const pmPos = Math.max(1, Math.min(ci.textOffset + 1, maxPos));
          const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pmPos));
          tr.setMeta('addToHistory', false);
          view.dispatch(tr);
          setToolbarTick((value) => value + 1);
        }
        useUIStore.getState().setFocusClickCoords(null);
      }

      // Insert pending character (selection-mode type-to-edit).
      const pi = useUIStore.getState().pendingInputChar;
      if (pi && pi.nodeId === propsRef.current.nodeId && pi.parentId === propsRef.current.parentId) {
        useUIStore.getState().setPendingInputChar(null);
        if (!view.composing) {
          const insertFrom = view.state.selection.from;
          const tr = view.state.tr.insertText(pi.char);
          const maxPos = tr.doc.content.size - 1;
          const nextPos = Math.max(1, Math.min(insertFrom + pi.char.length, maxPos));
          tr.setSelection(TextSelection.create(tr.doc, nextPos));
          view.dispatch(tr);
          setToolbarTick((value) => value + 1);
          // Mark as user edited so trigger detection (#, @, /) activates correctly
          // on the very first character typed after refocusing an empty node.
          triggerStateRef.current.hasUserEdited = true;
          runTriggerDetection(view, true);
        }
      }
    });
  }, []);

  const runTriggerDetection = useCallback((view: EditorView, docChanged: boolean) => {
    const stateRef = triggerStateRef.current;
    if (docChanged) stateRef.hasUserEdited = true;

    const { from } = view.state.selection;
    const $from = view.state.doc.resolve(from);
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

    const hashMatch = textBefore.match(/#([^\s#@]*)$/u);
    if (hashMatch && stateRef.hasUserEdited && (docChanged || stateRef.hashActive)) {
      stateRef.hashActive = true;
      const query = hashMatch[1];
      const hashStart = from - hashMatch[0].length;
      propsRef.current.onHashTag?.(query, hashStart, from, getCaretAnchorRect(view, from));
    } else {
      // Also deactivate if the dropdown is open via prop (triggerHint path) but
      // the editor's internal state was never activated — prevents stale dropdown.
      if (stateRef.hashActive || propsRef.current.hashTagActive) propsRef.current.onHashTagDeactivate?.();
      stateRef.hashActive = false;
    }

    const refMatch = textBefore.match(/@([^\s]*)$/);
    if (refMatch && stateRef.hasUserEdited && (docChanged || stateRef.referenceActive)) {
      stateRef.referenceActive = true;
      const query = refMatch[1];
      const atStart = from - refMatch[0].length;
      propsRef.current.onReference?.(query, atStart, from, getCaretAnchorRect(view, from));
    } else {
      if (stateRef.referenceActive || propsRef.current.referenceActive) propsRef.current.onReferenceDeactivate?.();
      stateRef.referenceActive = false;
    }

    const afterCursorText = $from.parent.textBetween(
      $from.parentOffset,
      $from.parent.content.size,
      undefined,
      '\ufffc',
    );
    // Product rule: slash menu only triggers when the current node is effectively empty
    // except for the "/query" text itself.
    const slashMatch = textBefore.match(/^\s*\/([^\s/]*)$/);
    const slashOnlyInEmptyNode = !!slashMatch && afterCursorText.trim() === '';
    if (slashOnlyInEmptyNode && stateRef.hasUserEdited && (docChanged || stateRef.slashActive)) {
      stateRef.slashActive = true;
      const query = slashMatch[1];
      const slashStart = from - (query.length + 1);
      propsRef.current.onSlashCommand?.(query, slashStart, from, getCaretAnchorRect(view, from));
    } else {
      if (stateRef.slashActive || propsRef.current.slashActive) propsRef.current.onSlashCommandDeactivate?.();
      stateRef.slashActive = false;
    }

    if (docChanged) {
      if (textBefore === '>' && !stateRef.fieldFired) {
        stateRef.fieldFired = true;
        propsRef.current.onFieldTriggerFire?.();
      } else if (textBefore !== '>') {
        stateRef.fieldFired = false;
      }
    }
  }, []);

  // Sync trigger state when OutlinerItem opens a dropdown via triggerHint but
  // the editor's internal state hasn't been activated (TrailingInput path).
  // This is a fallback for timing cases where the rAF in syncInitialFocus
  // fires before the trigger hint effect has propagated the prop change.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.isDestroyed) return;
    const ts = triggerStateRef.current;
    let synced = false;
    if (props.hashTagActive && !ts.hashActive) {
      ts.hasUserEdited = true;
      ts.hashActive = true;
      synced = true;
    }
    if (props.referenceActive && !ts.referenceActive) {
      ts.hasUserEdited = true;
      ts.referenceActive = true;
      synced = true;
    }
    if (props.slashActive && !ts.slashActive) {
      ts.hasUserEdited = true;
      ts.slashActive = true;
      synced = true;
    }
    // Run full detection to update the dropdown anchor position, but only if
    // the cursor position has been finalized (no pending focusClickCoords).
    // If a cursor restoration is pending, the rAF callback will handle
    // detection after positioning — running it here with the cursor at
    // position 0 would incorrectly deactivate the dropdown.
    if (synced && view.hasFocus()) {
      const pendingCoords = useUIStore.getState().focusClickCoords;
      if (!pendingCoords) {
        runTriggerDetection(view, true);
      }
    }
  }, [props.hashTagActive, props.referenceActive, props.slashActive, runTriggerDetection]);

  const plugins = useMemo<Plugin[]>(() => {
    const isComposing = (view: EditorView | null | undefined): boolean =>
      !!view && (view.composing || isComposingRef.current);

    const handleEnter = (view: EditorView) => {
      const intent = resolveNodeEditorEnterIntent({
        referenceActive: propsRef.current.referenceActive ?? false,
        hashTagActive: propsRef.current.hashTagActive ?? false,
        slashActive: propsRef.current.slashActive ?? false,
      });
      if (intent === 'reference_confirm') {
        propsRef.current.onReferenceConfirm?.();
        return true;
      }
      if (intent === 'hashtag_confirm') {
        propsRef.current.onHashTagConfirm?.();
        return true;
      }
      if (intent === 'slash_confirm') {
        propsRef.current.onSlashConfirm?.();
        return true;
      }

      const { from } = view.state.selection;
      const doc = view.state.doc;
      const docEnd = doc.content.size - 1;
      if (from >= docEnd) {
        saveContent();
        propsRef.current.onEnter();
        return true;
      }

      const para = doc.firstChild;
      if (!para) return false;

      const paraOffset = from - 1;
      const afterFragment = para.content.cut(paraOffset);
      const afterPayload = docToMarks(
        pmSchema.node('doc', null, [pmSchema.node('paragraph', null, afterFragment)]),
      );

      const tr = view.state.tr.delete(from, docEnd);
      tr.setMeta(META_DEFER_LORO_TEXT_COMMIT, true);
      view.dispatch(tr);
      saveContent();
      propsRef.current.onEnter(afterPayload);
      return true;
    };

    const handleBackspace = (view: EditorView) => {
      const parsed = docToMarks(view.state.doc);
      const isEmpty = parsed.text.replace(/\u200B/g, '').trim().length === 0;
      const { from, to } = view.state.selection;
      const docEnd = view.state.doc.content.size - 1;
      const isAtEnd = from >= docEnd && to >= docEnd;
      const normalized = parsed.text.replace(/\u200B/g, '').trim();
      const isSingleInlineRefAtom = normalized === '\uFFFC' && isOnlyInlineRef(parsed.text, parsed.inlineRefs);
      const intent = resolveNodeEditorBackspaceIntent({
        referenceActive: propsRef.current.referenceActive ?? false,
        hashTagActive: propsRef.current.hashTagActive ?? false,
        slashActive: propsRef.current.slashActive ?? false,
        isEmpty,
        isAtStart: from <= 1 && to <= 1,
        isAtEnd,
        isSingleInlineRefAtom,
      });
      if (intent === 'allow_default') return false;
      if (intent === 'select_reference') {
        saveContent();
        return propsRef.current.onBackspaceAtEndSingleInlineRef?.() ?? false;
      }
      if (intent === 'merge_with_previous') {
        saveContent();
        return propsRef.current.onBackspaceAtStart?.() ?? false;
      }
      updateNodeContent(propsRef.current.nodeId, { name: '', marks: [], inlineRefs: [] });
      saveContent();
      return propsRef.current.onDelete();
    };

    const handleArrowUp = (view: EditorView) => {
      const { from } = view.state.selection;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: propsRef.current.referenceActive ?? false,
        hashTagActive: propsRef.current.hashTagActive ?? false,
        slashActive: propsRef.current.slashActive ?? false,
        isAtBoundary: from <= 1,
      });
      if (intent === 'reference_nav') {
        propsRef.current.onReferenceNavUp?.();
        return true;
      }
      if (intent === 'hashtag_nav') {
        propsRef.current.onHashTagNavUp?.();
        return true;
      }
      if (intent === 'slash_nav') {
        propsRef.current.onSlashNavUp?.();
        return true;
      }
      if (intent === 'navigate_outliner') {
        propsRef.current.onArrowUp();
        return true;
      }
      return false;
    };

    const handleArrowDown = (view: EditorView) => {
      const { to } = view.state.selection;
      const endPos = view.state.doc.content.size - 1;
      const intent = resolveNodeEditorArrowIntent({
        referenceActive: propsRef.current.referenceActive ?? false,
        hashTagActive: propsRef.current.hashTagActive ?? false,
        slashActive: propsRef.current.slashActive ?? false,
        isAtBoundary: to >= endPos,
      });
      if (intent === 'reference_nav') {
        propsRef.current.onReferenceNavDown?.();
        return true;
      }
      if (intent === 'hashtag_nav') {
        propsRef.current.onHashTagNavDown?.();
        return true;
      }
      if (intent === 'slash_nav') {
        propsRef.current.onSlashNavDown?.();
        return true;
      }
      if (intent === 'navigate_outliner') {
        propsRef.current.onArrowDown();
        return true;
      }
      return false;
    };

    const handleEscape = () => {
      const intent = resolveNodeEditorEscapeIntent(
        {
          referenceActive: propsRef.current.referenceActive ?? false,
          hashTagActive: propsRef.current.hashTagActive ?? false,
          slashActive: propsRef.current.slashActive ?? false,
        },
      );
      if (intent === 'reference_close') {
        propsRef.current.onReferenceClose?.();
        return true;
      }
      if (intent === 'hashtag_close') {
        propsRef.current.onHashTagClose?.();
        return true;
      }
      if (intent === 'slash_close') {
        propsRef.current.onSlashClose?.();
        return true;
      }
      if (intent === 'select_current') {
        saveContent();
        propsRef.current.onEscapeSelect?.();
        return true;
      }
      return false;
    };

    return [
      keymap({
        Enter: (_state, _dispatch, view) => {
          if (!view || isComposing(view)) return false;
          return handleEnter(view);
        },
        Tab: (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          saveContent();
          propsRef.current.onIndent();
          return true;
        },
        'Shift-Tab': (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          saveContent();
          propsRef.current.onOutdent();
          return true;
        },
        Backspace: (_state, _dispatch, view) => {
          if (!view || isComposing(view)) return false;
          return handleBackspace(view);
        },
        ArrowUp: (_state, _dispatch, view) => {
          if (!view || isComposing(view)) return false;
          return handleArrowUp(view);
        },
        ArrowDown: (_state, _dispatch, view) => {
          if (!view || isComposing(view)) return false;
          return handleArrowDown(view);
        },
        Escape: (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          return handleEscape();
        },
        'Shift-ArrowUp': (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          saveContent();
          propsRef.current.onShiftArrow?.('up');
          return true;
        },
        'Shift-ArrowDown': (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          saveContent();
          propsRef.current.onShiftArrow?.('down');
          return true;
        },
        'Mod-a': (state, _dispatch, view) => {
          if (isComposing(view)) return false;
          const { from, to } = state.selection;
          const docEnd = state.doc.content.size - 1;
          if (from <= 1 && to >= docEnd) {
            saveContent();
            propsRef.current.onSelectAll?.();
            return true;
          }
          return false;
        },
        [KEY_EDITOR_DROPDOWN_FORCE_CREATE]: (_state, _dispatch, view) => {
          if (isComposing(view)) return false;
          const intent = resolveNodeEditorForceCreateIntent(
            {
              referenceActive: propsRef.current.referenceActive ?? false,
              hashTagActive: propsRef.current.hashTagActive ?? false,
              slashActive: propsRef.current.slashActive ?? false,
            },
          );
          if (intent === 'reference_create') {
            propsRef.current.onReferenceCreate?.();
            return true;
          }
          if (intent === 'hashtag_create') {
            propsRef.current.onHashTagCreate?.();
            return true;
          }
          if (intent === 'noop') return true;
          propsRef.current.onToggleDone?.();
          return true;
        },
        [KEY_EDITOR_MOVE_UP]: () => {
          propsRef.current.onMoveUp();
          return true;
        },
        [KEY_EDITOR_MOVE_DOWN]: () => {
          propsRef.current.onMoveDown();
          return true;
        },
        [KEY_EDITOR_EDIT_DESC_PRIMARY]: () => {
          propsRef.current.onDescriptionEdit?.();
          return true;
        },
        ...(KEY_EDITOR_EDIT_DESC_SECONDARY
          ? {
            [KEY_EDITOR_EDIT_DESC_SECONDARY]: () => {
              propsRef.current.onDescriptionEdit?.();
              return true;
            },
          }
          : {}),
        'Mod-z': () => {
          undoDoc();
          return true;
        },
        'Mod-y': () => {
          redoDoc();
          return true;
        },
        'Mod-Shift-z': () => {
          redoDoc();
          return true;
        },
        'Mod-b': toggleMark(pmSchema.marks.bold),
        'Mod-i': toggleMark(pmSchema.marks.italic),
        'Mod-e': toggleMark(pmSchema.marks.code),
        'Mod-Shift-s': toggleMark(pmSchema.marks.strike),
        'Mod-Shift-h': toggleMark(pmSchema.marks.highlight),
      }),
      keymap(baseKeymap),
    ];
  }, [saveContent, updateNodeContent]);

  useLayoutEffect(() => {
    if (!mountRef.current) return;

    triggerStateRef.current = {
      hasUserEdited: false,
      hashActive: false,
      referenceActive: false,
      slashActive: false,
      fieldFired: false,
    };

    const state = EditorState.create({
      schema: pmSchema,
      doc: marksToDoc(
        propsRef.current.initialText,
        propsRef.current.initialMarks,
        propsRef.current.initialInlineRefs,
      ),
      plugins,
    });

    const view = new EditorView(mountRef.current, {
      state,
      dispatchTransaction: (tr) => {
        const newState = view.state.apply(tr);
        view.updateState(newState);
        setToolbarTick((value) => value + 1);
        const isComposing = isComposingRef.current || view.composing;

        if (tr.docChanged && !isExternalSyncRef.current && !isComposing) {
          const parsed = docToMarks(newState.doc);
          const deferLoroCommit = tr.getMeta(META_DEFER_LORO_TEXT_COMMIT) === true;
          updateNodeContent(propsRef.current.nodeId, {
            name: parsed.text,
            marks: parsed.marks,
            inlineRefs: parsed.inlineRefs,
          });
          if (!deferLoroCommit) {
            commitDoc('user:text');
          }
          initialContentRef.current = {
            text: parsed.text,
            marks: parsed.marks,
            inlineRefs: parsed.inlineRefs,
          };
        }

        if (!isExternalSyncRef.current && !isComposing && tr.getMeta('nodex:isPaste') !== true) {
          runTriggerDetection(view, tr.docChanged);
        }
      },
      handleDOMEvents: {
        paste: (view, event) => {
          const clipboardEvent = event as ClipboardEvent;
          clipboardEvent.preventDefault();
          const plain = clipboardEvent.clipboardData?.getData('text/plain') ?? '';
          const html = clipboardEvent.clipboardData?.getData('text/html') ?? '';
          logPasteDebug('RichTextEditor.paste:raw', {
            mode: pasteShiftRef.current ? 'plain' : 'smart',
            clipboardTypes: clipboardEvent.clipboardData ? Array.from(clipboardEvent.clipboardData.types ?? []) : [],
            plainPreview: previewMultiline(plain),
            htmlPreview: previewMultiline((html ?? '').replace(/\s+/g, ' ').trim(), 8),
          });
          if (!plain.trim() && !html.trim()) return true;

          const { from, to } = view.state.selection;
          const hasSelection = from !== to;
          const isPlainPaste = pasteShiftRef.current;
          pasteShiftRef.current = false; // Reset after reading

          // ⌘⇧V (plain paste): always flatten multi-line to single line
          if (isPlainPaste) {
            const normalized = plain.replace(/[\r\n]+/g, ' ').trim();
            const tr = view.state.tr.insertText(normalized, from, to);
            tr.setMeta('nodex:isPaste', true);
            view.dispatch(tr);
            return true;
          }

          // ⌘V (smart paste): check for soma node link first
          const nodeLinkId = parseNodeLinkFromHtml(html);
          if (nodeLinkId && loroHasNode(nodeLinkId)) {
            const { nodeId: curNodeId, parentId: curParentId } = propsRef.current;
            const store = useNodeStore.getState();
            // Insert reference as next sibling of current node
            const siblings = store.getChildren(curParentId);
            const curIdx = siblings.findIndex((c) => c.id === curNodeId);
            const insertPos = curIdx >= 0 ? curIdx + 1 : undefined;
            store.addReference(curParentId, nodeLinkId, insertPos);
            return true;
          }

          // Check for URL (single-line only)
          const normalized = plain.replace(/[\r\n]+/g, ' ').trim();
          const nonEmptyLines = plain
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          if (nonEmptyLines.length === 1 && isLikelyUrl(normalized)) {
            if (hasSelection) {
              let tr = view.state.tr.addMark(from, to, pmSchema.marks.link.create({ href: normalized }));
              tr = tr.setSelection(TextSelection.create(tr.doc, to));
              tr.setMeta('nodex:isPaste', true);
              view.dispatch(tr);
            } else {
              const linkMark = pmSchema.marks.link.create({ href: normalized });
              const textNode = pmSchema.text(normalized, [linkMark]);
              let tr = view.state.tr.insert(from, textNode);
              tr = tr.setSelection(TextSelection.create(tr.doc, from + normalized.length));
              tr.setMeta('nodex:isPaste', true);
              view.dispatch(tr);
            }
            return true;
          }

          const parsedNodes = parseMultiLinePaste(plain, html).filter((node) =>
            node.name.trim().length > 0
            || node.children.length > 0
            || (node.tags?.length ?? 0) > 0
            || (node.fields?.length ?? 0) > 0,
          );
          logPasteDebug('RichTextEditor.paste:parsed', {
            parsedCount: parsedNodes.length,
            parsed: summarizePasteNodes(parsedNodes),
          });
          if (parsedNodes.length === 0) return true;

          const firstNode = parsedNodes[0];
          const restNodes = parsedNodes.slice(1);
          const hasMetadata = (firstNode.tags?.length ?? 0) > 0 || (firstNode.fields?.length ?? 0) > 0;
          const hasChildren = firstNode.children.length > 0;
          const shouldDeferCommit = restNodes.length > 0 || hasMetadata || hasChildren;

          if (restNodes.length > 0 && !propsRef.current.onPasteMultiLine) {
            const fallback = parsedNodes.map((node) => node.name).filter(Boolean).join(' ');
            const tr = view.state.tr.insertText(fallback, from, to);
            tr.setMeta('nodex:isPaste', true);
            view.dispatch(tr);
            return true;
          }

          const firstDoc = marksToDoc(firstNode.name, firstNode.marks ?? [], firstNode.inlineRefs ?? []);
          const paragraph = firstDoc.firstChild;
          let tr = view.state.tr;
          if (paragraph && paragraph.content.size > 0) {
            tr = tr.replaceWith(from, to, paragraph.content);
            const cursorPos = Math.min(tr.doc.content.size, from + paragraph.content.size);
            tr = tr.setSelection(TextSelection.create(tr.doc, cursorPos));
          } else {
            tr = tr.insertText(firstNode.name, from, to);
          }
          tr.setMeta('nodex:isPaste', true);
          if (shouldDeferCommit) {
            tr.setMeta(META_DEFER_LORO_TEXT_COMMIT, true);
          }
          view.dispatch(tr);

          if (!shouldDeferCommit) return true;

          saveContent();
          if (hasMetadata) {
            applyParsedPasteMetadata(propsRef.current.nodeId, firstNode, { commit: false });
          }
          if (hasChildren) {
            createChildNodesFromPaste(propsRef.current.nodeId, firstNode.children, { commit: false });
          }
          if (restNodes.length > 0 && propsRef.current.onPasteMultiLine) {
            propsRef.current.onPasteMultiLine(restNodes);
          } else if (hasMetadata || hasChildren) {
            commitDoc('user:paste');
          }
          return true;
        },
        keydown: (_view, event) => {
          const keyboardEvent = event as KeyboardEvent;
          // Track Shift state for paste: Cmd+V vs Cmd+Shift+V
          if (keyboardEvent.key.toLowerCase() === 'v' && (keyboardEvent.metaKey || keyboardEvent.ctrlKey)) {
            pasteShiftRef.current = keyboardEvent.shiftKey;
          }
          if (isImeComposingEvent(keyboardEvent)) {
            isComposingRef.current = true;
            const pendingInput = useUIStore.getState().pendingInputChar;
            if (pendingInput && pendingInput.nodeId === propsRef.current.nodeId && pendingInput.parentId === propsRef.current.parentId) {
              useUIStore.getState().setPendingInputChar(null);
            }
          }
          return false;
        },
        beforeinput: () => {
          const pendingInput = useUIStore.getState().pendingInputChar;
          if (pendingInput && pendingInput.nodeId === propsRef.current.nodeId && pendingInput.parentId === propsRef.current.parentId) {
            useUIStore.getState().setPendingInputChar(null);
          }
          return false;
        },
        compositionstart: () => {
          isComposingRef.current = true;
          const pendingInput = useUIStore.getState().pendingInputChar;
          if (pendingInput && pendingInput.nodeId === propsRef.current.nodeId && pendingInput.parentId === propsRef.current.parentId) {
            useUIStore.getState().setPendingInputChar(null);
          }
          return false;
        },
        compositionend: (view) => {
          isComposingRef.current = false;
          const parsed = docToMarks(view.state.doc);
          updateNodeContent(propsRef.current.nodeId, {
            name: parsed.text,
            marks: parsed.marks,
            inlineRefs: parsed.inlineRefs,
          });
          commitDoc('user:text');
          initialContentRef.current = {
            text: parsed.text,
            marks: parsed.marks,
            inlineRefs: parsed.inlineRefs,
          };
          runTriggerDetection(view, true);
          return false;
        },
        mousedown: (view, event) => {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) return false;

          // Link click: open in new tab immediately (before ProseMirror places cursor)
          const target = mouseEvent.target as HTMLElement;
          const anchor = target.tagName === 'A' ? target : target.closest('a');
          if (anchor) {
            const href = (anchor as HTMLAnchorElement).getAttribute('href');
            if (href) {
              mouseEvent.preventDefault();
              chrome.tabs.create({ url: href });
              return true;
            }
          }

          if (mouseEvent.altKey || mouseEvent.ctrlKey || mouseEvent.metaKey || mouseEvent.shiftKey) return false;
          if (mouseEvent.detail !== 1) return false;

          const endPos = Math.max(1, view.state.doc.content.size - 1);
          let endRect: ReturnType<EditorView['coordsAtPos']>;
          try {
            endRect = view.coordsAtPos(endPos);
          } catch {
            return false;
          }

          const lineTop = Math.min(endRect.top, endRect.bottom);
          const lineBottom = Math.max(endRect.top, endRect.bottom);
          if (mouseEvent.clientY < lineTop - 1 || mouseEvent.clientY > lineBottom + 1) return false;
          if (mouseEvent.clientX < endRect.left - 1) return false;

          requestAnimationFrame(() => {
            if (viewRef.current !== view) return;
            const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, endPos));
            tr.setMeta('addToHistory', false);
            view.dispatch(tr);
            setToolbarTick((value) => value + 1);
          });

          return false;
        },
        blur: () => {
          isComposingRef.current = false;
          setToolbarTick((value) => value + 1);
          // When TagSelectorPopover is open, its input steals focus.
          // Skip the blur callback to prevent the editor from unmounting
          // (which would destroy the popover before the user can interact).
          if (tagSelectorOpenRef.current) return false;
          saveContent();
          propsRef.current.onBlur();
          return false;
        },
      },
    });

    viewRef.current = view;
    if (propsRef.current.editorRef) propsRef.current.editorRef.current = view;
    syncInitialFocus(view);

    return () => {
      if (focusRafRef.current !== null) {
        cancelAnimationFrame(focusRafRef.current);
        focusRafRef.current = null;
      }
      saveContent();
      if (propsRef.current.editorRef?.current === view) {
        propsRef.current.editorRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [plugins, runTriggerDetection, saveContent, syncInitialFocus, updateNodeContent]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (isComposingRef.current || view.composing) return;

    const current = docToMarks(view.state.doc);
    if (contentEquals(
      current.text,
      current.marks,
      current.inlineRefs,
      props.initialText,
      props.initialMarks,
      props.initialInlineRefs,
    )) {
      return;
    }

    isExternalSyncRef.current = true;
    try {
      const nextDoc = marksToDoc(props.initialText, props.initialMarks, props.initialInlineRefs);
      const prevFrom = view.state.selection.from;
      const prevTo = view.state.selection.to;
      const maxPos = nextDoc.content.size - 1;
      const nextFrom = Math.max(1, Math.min(prevFrom, maxPos));
      const nextTo = Math.max(1, Math.min(prevTo, maxPos));

      let tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nextDoc.content);
      tr = tr.setMeta('addToHistory', false);
      tr = tr.setSelection(TextSelection.create(tr.doc, nextFrom, nextTo));
      view.dispatch(tr);
      setToolbarTick((value) => value + 1);
    } finally {
      isExternalSyncRef.current = false;
    }

    // Update baseline after genuine external sync so that saveContent doesn't
    // redundantly re-save content that was already persisted by another source.
    initialContentRef.current = {
      text: props.initialText,
      marks: props.initialMarks,
      inlineRefs: props.initialInlineRefs,
    };
  }, [props.initialInlineRefs, props.initialMarks, props.initialText]);

  // ─── # Tag selector state ───
  const [tagSelectorOpen, setTagSelectorOpen] = useState(false);
  const tagSelectorOpenRef = useRef(false);
  tagSelectorOpenRef.current = tagSelectorOpen;
  const [tagSelectorAnchor, setTagSelectorAnchor] = useState({ top: 0, left: 0 });

  const handleTagClick = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;

    // Get toolbar position from the selection to anchor the popover
    const { from, to } = view.state.selection;
    if (from === to) return;

    try {
      const coords = view.coordsAtPos(from);
      setTagSelectorAnchor({ top: coords.top, left: coords.left });
    } catch {
      setTagSelectorAnchor({ top: 0, left: 0 });
    }
    setTagSelectorOpen(true);
  }, []);

  const handleTagSelect = useCallback((result: TagSelectorResult) => {
    setTagSelectorOpen(false);
    const view = viewRef.current;
    if (!view) return;

    const store = useNodeStore.getState() as HighlightNodeStore;
    const extractResult = extractToTaggedNode(
      view,
      result.tagDefId,
      propsRef.current.nodeId,
      store,
      initialContentRef.current.inlineRefs,
    );

    if (extractResult) {
      // Persist the updated content (text with \uFFFC + inline refs)
      updateNodeContent(propsRef.current.nodeId, {
        name: extractResult.newText,
        inlineRefs: extractResult.newInlineRefs,
      });
      commitDoc('user:text');
      initialContentRef.current = {
        text: extractResult.newText,
        marks: initialContentRef.current.marks,
        inlineRefs: extractResult.newInlineRefs,
      };
      setToolbarTick(v => v + 1);
    }
  }, [updateNodeContent]);

  const handleTagSelectorClose = useCallback(() => {
    setTagSelectorOpen(false);
    viewRef.current?.focus();
  }, []);

  return (
    <div className="editor-inline">
      <FloatingToolbar view={viewRef.current} tick={toolbarTick} onTagClick={handleTagClick} />
      {tagSelectorOpen && (
        <TagSelectorPopover
          anchorTop={tagSelectorAnchor.top}
          anchorLeft={tagSelectorAnchor.left}
          onSelect={handleTagSelect}
          onClose={handleTagSelectorClose}
        />
      )}
      <div ref={mountRef} className="outline-none text-[15px] leading-6" />
    </div>
  );
}
