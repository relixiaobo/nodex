import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Plugin } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import { keymap } from '@tiptap/pm/keymap';
import { baseKeymap, toggleMark } from '@tiptap/pm/commands';
import { history, redo, undo } from '@tiptap/pm/history';
import { useNodeStore } from '../../stores/node-store.js';
import { useWorkspaceStore } from '../../stores/workspace-store.js';
import { useUIStore } from '../../stores/ui-store.js';
import { getPrimaryShortcutKey, getShortcutKeys } from '../../lib/shortcut-registry.js';
import {
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEnterIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../lib/node-editor-shortcuts.js';
import type { InlineRefEntry, TextMark } from '../../types/index.js';
import { docToMarks, marksToDoc } from '../../lib/pm-doc-utils.js';
import { pmSchema } from './pm-schema.js';

const KEY_EDITOR_DROPDOWN_FORCE_CREATE = getPrimaryShortcutKey('editor.dropdown_force_create', 'Mod-Enter');
const KEY_EDITOR_MOVE_UP = getPrimaryShortcutKey('editor.move_up', 'Mod-Shift-ArrowUp');
const KEY_EDITOR_MOVE_DOWN = getPrimaryShortcutKey('editor.move_down', 'Mod-Shift-ArrowDown');
const [KEY_EDITOR_EDIT_DESC_PRIMARY, KEY_EDITOR_EDIT_DESC_SECONDARY] = getShortcutKeys(
  'editor.edit_description',
  ['Ctrl-i'],
);

interface TriggerRuntimeState {
  hasUserEdited: boolean;
  hashActive: boolean;
  referenceActive: boolean;
  slashActive: boolean;
  fieldFired: boolean;
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
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHashTag?: (query: string, from: number, to: number) => void;
  onHashTagDeactivate?: () => void;
  editorRef?: MutableRefObject<EditorView | null>;
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
  onSlashCommand?: (query: string, from: number, to: number) => void;
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
  const mountRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const savedRef = useRef(false);
  const isExternalSyncRef = useRef(false);
  const triggerStateRef = useRef<TriggerRuntimeState>({
    hasUserEdited: false,
    hashActive: false,
    referenceActive: false,
    slashActive: false,
    fieldFired: false,
  });

  const propsRef = useRef(props);
  propsRef.current = props;

  const userId = useWorkspaceStore((s) => s.userId);
  const setNodeContentLocal = useNodeStore((s) => s.setNodeContentLocal);
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
      propsRef.current.initialText,
      propsRef.current.initialMarks,
      propsRef.current.initialInlineRefs,
    );

    if (changed && userId) {
      updateNodeContent(
        propsRef.current.nodeId,
        parsed.text,
        parsed.marks,
        parsed.inlineRefs,
        userId,
      );
    }
  }, [updateNodeContent, userId]);

  const runTriggerDetection = useCallback((view: EditorView, docChanged: boolean) => {
    const stateRef = triggerStateRef.current;
    if (docChanged) stateRef.hasUserEdited = true;

    const { from } = view.state.selection;
    const $from = view.state.doc.resolve(from);
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');

    const hashMatch = textBefore.match(/#(\w*)$/);
    if (hashMatch && stateRef.hasUserEdited && (docChanged || stateRef.hashActive)) {
      stateRef.hashActive = true;
      const query = hashMatch[1];
      const hashStart = from - hashMatch[0].length;
      propsRef.current.onHashTag?.(query, hashStart, from);
    } else {
      if (stateRef.hashActive) propsRef.current.onHashTagDeactivate?.();
      stateRef.hashActive = false;
    }

    const refMatch = textBefore.match(/@([^\s]*)$/);
    if (refMatch && stateRef.hasUserEdited && (docChanged || stateRef.referenceActive)) {
      stateRef.referenceActive = true;
      const query = refMatch[1];
      const atStart = from - refMatch[0].length;
      propsRef.current.onReference?.(query, atStart, from);
    } else {
      if (stateRef.referenceActive) propsRef.current.onReferenceDeactivate?.();
      stateRef.referenceActive = false;
    }

    const slashMatch = textBefore.match(/(?:^|\s)\/([^\s/]*)$/);
    if (slashMatch && stateRef.hasUserEdited && (docChanged || stateRef.slashActive)) {
      stateRef.slashActive = true;
      const query = slashMatch[1];
      const slashStart = from - (query.length + 1);
      propsRef.current.onSlashCommand?.(query, slashStart, from);
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
      view.dispatch(tr);
      saveContent();
      propsRef.current.onEnter(afterPayload);
      return true;
    };

    const handleBackspace = (view: EditorView) => {
      const parsed = docToMarks(view.state.doc);
      const isEmpty = parsed.text.replace(/\u200B/g, '').trim().length === 0;
      if (!isEmpty) return false;
      setNodeContentLocal(propsRef.current.nodeId, '', [], []);
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
        propsRef.current.referenceActive ?? false,
        propsRef.current.hashTagActive ?? false,
        propsRef.current.slashActive ?? false,
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
      history({ depth: 100 }),
      keymap({
        Enter: (_state, _dispatch, view) => {
          if (!view) return false;
          return handleEnter(view);
        },
        Tab: () => {
          propsRef.current.onIndent();
          return true;
        },
        'Shift-Tab': () => {
          propsRef.current.onOutdent();
          return true;
        },
        Backspace: (_state, _dispatch, view) => {
          if (!view) return false;
          return handleBackspace(view);
        },
        ArrowUp: (_state, _dispatch, view) => {
          if (!view) return false;
          return handleArrowUp(view);
        },
        ArrowDown: (_state, _dispatch, view) => {
          if (!view) return false;
          return handleArrowDown(view);
        },
        Escape: () => handleEscape(),
        'Shift-ArrowUp': () => {
          saveContent();
          propsRef.current.onShiftArrow?.('up');
          return true;
        },
        'Shift-ArrowDown': () => {
          saveContent();
          propsRef.current.onShiftArrow?.('down');
          return true;
        },
        'Mod-a': (state) => {
          const { from, to } = state.selection;
          const docEnd = state.doc.content.size - 1;
          if (from <= 1 && to >= docEnd) {
            saveContent();
            propsRef.current.onSelectAll?.();
            return true;
          }
          return false;
        },
        [KEY_EDITOR_DROPDOWN_FORCE_CREATE]: () => {
          const intent = resolveNodeEditorForceCreateIntent(
            propsRef.current.referenceActive ?? false,
            propsRef.current.hashTagActive ?? false,
            propsRef.current.slashActive ?? false,
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
        'Mod-z': (state, dispatch) => undo(state, dispatch),
        'Mod-y': (state, dispatch) => redo(state, dispatch),
        'Mod-Shift-z': (state, dispatch) => redo(state, dispatch),
        'Mod-b': toggleMark(pmSchema.marks.bold),
        'Mod-i': toggleMark(pmSchema.marks.italic),
        'Mod-e': toggleMark(pmSchema.marks.code),
        'Mod-Shift-s': toggleMark(pmSchema.marks.strike),
        'Mod-Shift-h': toggleMark(pmSchema.marks.highlight),
      }),
      keymap(baseKeymap),
    ];
  }, [saveContent, setNodeContentLocal]);

  useEffect(() => {
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

        if (tr.docChanged && !isExternalSyncRef.current) {
          const parsed = docToMarks(newState.doc);
          setNodeContentLocal(propsRef.current.nodeId, parsed.text, parsed.marks, parsed.inlineRefs);
        }

        if (!isExternalSyncRef.current) {
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
        blur: () => {
          saveContent();
          propsRef.current.onBlur();
          return false;
        },
      },
    });

    viewRef.current = view;
    if (propsRef.current.editorRef) propsRef.current.editorRef.current = view;

    return () => {
      saveContent();
      if (propsRef.current.editorRef?.current === view) {
        propsRef.current.editorRef.current = null;
      }
      view.destroy();
      viewRef.current = null;
    };
  }, [plugins, runTriggerDetection, saveContent, setNodeContentLocal]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

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
    } finally {
      isExternalSyncRef.current = false;
    }
  }, [props.initialInlineRefs, props.initialMarks, props.initialText]);

  useLayoutEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    savedRef.current = false;
    view.focus();

    const clickInfo = useUIStore.getState().focusClickCoords;
    if (clickInfo && clickInfo.nodeId === props.nodeId && clickInfo.parentId === props.parentId) {
      const maxPos = view.state.doc.content.size - 1;
      const pmPos = Math.max(1, Math.min(clickInfo.textOffset + 1, maxPos));
      const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, pmPos));
      tr.setMeta('addToHistory', false);
      view.dispatch(tr);
      useUIStore.getState().setFocusClickCoords(null);
    }

    const pendingChar = useUIStore.getState().pendingInputChar;
    if (pendingChar) {
      useUIStore.getState().setPendingInputChar(null);
      view.dispatch(view.state.tr.insertText(pendingChar));
    }

    if (props.editorRef) props.editorRef.current = view;

    return () => {
      if (props.editorRef?.current === view) {
        props.editorRef.current = null;
      }
    };
  }, [props.editorRef, props.nodeId, props.parentId]);

  return (
    <div className="editor-inline">
      <div ref={mountRef} className="outline-none text-sm leading-[21px]" />
    </div>
  );
}
