import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { EditorState, TextSelection, type Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { commitDoc, redoDoc, undoDoc } from '../../lib/loro-doc.js';
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
      view.focus();
      return;
    }

    // --- Click-created editor (needs cursor placement) ---
    // Give the contenteditable DOM focus immediately so keystrokes arriving
    // before rAF are captured.  We use view.dom.focus() (not view.focus())
    // to avoid selectionToDOM() which would place the cursor at position 0
    // before we can restore the click-based offset.
    if (!view.hasFocus()) {
      view.dom.focus();
    }

    if (focusRafRef.current !== null) {
      cancelAnimationFrame(focusRafRef.current);
    }
    focusRafRef.current = requestAnimationFrame(() => {
      focusRafRef.current = null;
      if (viewRef.current !== view) return;

      // Full PM focus (including selectionToDOM) now that browser has painted.
      if (!view.hasFocus()) {
        view.focus();
      }
      if (!view.hasFocus()) return;

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
      if (stateRef.hashActive) propsRef.current.onHashTagDeactivate?.();
      stateRef.hashActive = false;
    }

    const refMatch = textBefore.match(/@([^\s]*)$/);
    if (refMatch && stateRef.hasUserEdited && (docChanged || stateRef.referenceActive)) {
      stateRef.referenceActive = true;
      const query = refMatch[1];
      const atStart = from - refMatch[0].length;
      propsRef.current.onReference?.(query, atStart, from, getCaretAnchorRect(view, from));
    } else {
      if (stateRef.referenceActive) propsRef.current.onReferenceDeactivate?.();
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
      if (stateRef.slashActive) propsRef.current.onSlashCommandDeactivate?.();
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
          console.debug('[undo-debug] editor-keymap undo');
          undoDoc();
          return true;
        },
        'Mod-y': () => {
          console.debug('[undo-debug] editor-keymap redo');
          redoDoc();
          return true;
        },
        'Mod-Shift-z': () => {
          console.debug('[undo-debug] editor-keymap redo');
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

        if (!isExternalSyncRef.current && !isComposing) {
          runTriggerDetection(view, tr.docChanged);
        }
      },
      handlePaste: (view, event) => {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const normalized = text.replace(/[\r\n]+/g, ' ');
        const { from, to } = view.state.selection;
        view.dispatch(view.state.tr.insertText(normalized, from, to));
        return true;
      },
      handleDOMEvents: {
        keydown: (_view, event) => {
          const keyboardEvent = event as KeyboardEvent;
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

  return (
    <div className="editor-inline">
      <FloatingToolbar view={viewRef.current} tick={toolbarTick} />
      <div ref={mountRef} className="outline-none text-sm leading-[21px]" />
    </div>
  );
}
