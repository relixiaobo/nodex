/**
 * Per-node TipTap editor.
 *
 * Created only when a node is focused. On blur, extracts HTML content
 * and saves back to the store, then the instance is destroyed.
 *
 * Keyboard shortcuts (handled via TipTap keymap, propagated to outliner):
 *   Enter       → save + create sibling
 *   Tab         → indent node
 *   Shift+Tab   → outdent node
 *   Backspace   → delete node (when empty)
 *   ArrowUp     → focus previous node
 *   ArrowDown   → focus next node
 */
import { useEffect, useLayoutEffect, useRef, useMemo, useCallback, type MutableRefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Italic from '@tiptap/extension-italic';
import { DOMSerializer } from '@tiptap/pm/model';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { getPrimaryShortcutKey, getShortcutKeys } from '../../lib/shortcut-registry';
import { stripWrappingP, wrapInP } from '../../lib/editor-html.js';
import {
  resolveNodeEditorArrowIntent,
  resolveNodeEditorEnterIntent,
  resolveNodeEditorEscapeIntent,
  resolveNodeEditorForceCreateIntent,
} from '../../lib/node-editor-shortcuts.js';
import { HashTagExtension, type HashTagCallbacks } from './HashTagExtension';
import { FieldTriggerExtension, type FieldTriggerCallbacks } from './FieldTriggerExtension';
import { ReferenceExtension, type ReferenceCallbacks } from './ReferenceExtension';
import { SlashCommandExtension, type SlashCommandCallbacks } from './SlashCommandExtension';
import { InlineRefNode } from './InlineRefNode';

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
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => boolean; // returns true if node was deleted
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onHashTag?: (query: string, from: number, to: number) => void;
  onHashTagDeactivate?: () => void;
  /** Ref to get the editor instance (for deleting #query text from outside) */
  editorRef?: MutableRefObject<Editor | null>;
  // ─── HashTag dropdown keyboard forwarding ───
  hashTagActive?: boolean;
  onHashTagConfirm?: () => void;
  onHashTagNavDown?: () => void;
  onHashTagNavUp?: () => void;
  onHashTagCreate?: () => void;
  onHashTagClose?: () => void;
  // ─── Field trigger (>) ───
  onFieldTriggerFire?: () => void;
  // ─── Reference trigger (@) ───
  onReference?: (query: string, from: number, to: number) => void;
  onReferenceDeactivate?: () => void;
  referenceActive?: boolean;
  onReferenceConfirm?: () => void;
  onReferenceNavDown?: () => void;
  onReferenceNavUp?: () => void;
  onReferenceCreate?: () => void;
  onReferenceClose?: () => void;
  // ─── Slash trigger (/) ───
  onSlashCommand?: (query: string, from: number, to: number) => void;
  onSlashCommandDeactivate?: () => void;
  slashActive?: boolean;
  onSlashConfirm?: () => void;
  onSlashNavDown?: () => void;
  onSlashNavUp?: () => void;
  onSlashClose?: () => void;
  // ─── Description editing ───
  onDescriptionEdit?: () => void;
  // ─── Checkbox toggle (Cmd+Enter when no dropdown) ───
  onToggleDone?: () => void;
  // ─── Selection mode transitions ───
  onEscapeSelect?: () => void;
  onShiftArrow?: (direction: 'up' | 'down') => void;
}

export function NodeEditor({
  nodeId,
  parentId,
  initialContent,
  onBlur,
  onEnter,
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
  onSlashCommand,
  onSlashCommandDeactivate,
  slashActive,
  onSlashConfirm,
  onSlashNavDown,
  onSlashNavUp,
  onSlashClose,
  onDescriptionEdit,
  onToggleDone,
  onEscapeSelect,
  onShiftArrow,
}: NodeEditorProps) {
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const setNodeNameLocal = useNodeStore((s) => s.setNodeNameLocal);
  const userId = useWorkspaceStore((s) => s.userId);
  const savedRef = useRef(false);

  // Snapshot click position for THIS node without side effects during render.
  // Clearing the shared hint happens in useLayoutEffect.
  const initialClickOffsetRef = useRef<number | null>(null);
  if (initialClickOffsetRef.current === null) {
    const info = useUIStore.getState().focusClickCoords;
    if (info && info.nodeId === nodeId && info.parentId === parentId) {
      initialClickOffsetRef.current = info.textOffset;
    }
  }

  const saveContent = useCallback(
    (html: string) => {
      if (savedRef.current) return;
      savedRef.current = true;
      const cleaned = stripWrappingP(html);
      if (cleaned !== initialContent && userId) {
        updateNodeName(nodeId, cleaned, userId);
      }
    },
    [nodeId, initialContent, userId, updateNodeName],
  );

  // Store latest callbacks in refs so TipTap extension doesn't go stale
  const callbacksRef = useRef({
    onEnter, onIndent, onOutdent, onDelete, onArrowUp, onArrowDown, onMoveUp, onMoveDown, saveContent,
    setNodeNameLocal, nodeId,
    hashTagActive: hashTagActive ?? false,
    onHashTagConfirm: onHashTagConfirm ?? (() => {}),
    onHashTagNavDown: onHashTagNavDown ?? (() => {}),
    onHashTagNavUp: onHashTagNavUp ?? (() => {}),
    onHashTagCreate: onHashTagCreate ?? (() => {}),
    onHashTagClose: onHashTagClose ?? (() => {}),
    referenceActive: referenceActive ?? false,
    onReferenceConfirm: onReferenceConfirm ?? (() => {}),
    onReferenceNavDown: onReferenceNavDown ?? (() => {}),
    onReferenceNavUp: onReferenceNavUp ?? (() => {}),
    onReferenceCreate: onReferenceCreate ?? (() => {}),
    onReferenceClose: onReferenceClose ?? (() => {}),
    slashActive: slashActive ?? false,
    onSlashConfirm: onSlashConfirm ?? (() => {}),
    onSlashNavDown: onSlashNavDown ?? (() => {}),
    onSlashNavUp: onSlashNavUp ?? (() => {}),
    onSlashClose: onSlashClose ?? (() => {}),
    onDescriptionEdit: onDescriptionEdit ?? (() => {}),
    onToggleDone: onToggleDone ?? (() => {}),
    onEscapeSelect: onEscapeSelect ?? (() => {}),
    onShiftArrow: onShiftArrow ?? (() => {}),
  });
  callbacksRef.current = {
    onEnter, onIndent, onOutdent, onDelete, onArrowUp, onArrowDown, onMoveUp, onMoveDown, saveContent,
    setNodeNameLocal, nodeId,
    hashTagActive: hashTagActive ?? false,
    onHashTagConfirm: onHashTagConfirm ?? (() => {}),
    onHashTagNavDown: onHashTagNavDown ?? (() => {}),
    onHashTagNavUp: onHashTagNavUp ?? (() => {}),
    onHashTagCreate: onHashTagCreate ?? (() => {}),
    onHashTagClose: onHashTagClose ?? (() => {}),
    referenceActive: referenceActive ?? false,
    onReferenceConfirm: onReferenceConfirm ?? (() => {}),
    onReferenceNavDown: onReferenceNavDown ?? (() => {}),
    onReferenceNavUp: onReferenceNavUp ?? (() => {}),
    onReferenceCreate: onReferenceCreate ?? (() => {}),
    onReferenceClose: onReferenceClose ?? (() => {}),
    slashActive: slashActive ?? false,
    onSlashConfirm: onSlashConfirm ?? (() => {}),
    onSlashNavDown: onSlashNavDown ?? (() => {}),
    onSlashNavUp: onSlashNavUp ?? (() => {}),
    onSlashClose: onSlashClose ?? (() => {}),
    onDescriptionEdit: onDescriptionEdit ?? (() => {}),
    onToggleDone: onToggleDone ?? (() => {}),
    onEscapeSelect: onEscapeSelect ?? (() => {}),
    onShiftArrow: onShiftArrow ?? (() => {}),
  };

  // HashTag extension callbacks
  const hashTagRef = useRef<HashTagCallbacks>({
    onActivate: (query, from, to) => onHashTag?.(query, from, to),
    onDeactivate: () => onHashTagDeactivate?.(),
  });
  hashTagRef.current = {
    onActivate: (query, from, to) => onHashTag?.(query, from, to),
    onDeactivate: () => onHashTagDeactivate?.(),
  };

  // FieldTrigger extension callbacks (fire-once, no query tracking)
  const fieldTriggerRef = useRef<FieldTriggerCallbacks>({
    onActivate: () => onFieldTriggerFire?.(),
  });
  fieldTriggerRef.current = {
    onActivate: () => onFieldTriggerFire?.(),
  };

  // Reference extension callbacks
  const referenceRef = useRef<ReferenceCallbacks>({
    onActivate: (query, from, to) => onReference?.(query, from, to),
    onDeactivate: () => onReferenceDeactivate?.(),
  });
  referenceRef.current = {
    onActivate: (query, from, to) => onReference?.(query, from, to),
    onDeactivate: () => onReferenceDeactivate?.(),
  };

  // Slash command extension callbacks
  const slashRef = useRef<SlashCommandCallbacks>({
    onActivate: (query, from, to) => onSlashCommand?.(query, from, to),
    onDeactivate: () => onSlashCommandDeactivate?.(),
  });
  slashRef.current = {
    onActivate: (query, from, to) => onSlashCommand?.(query, from, to),
    onDeactivate: () => onSlashCommandDeactivate?.(),
  };

  const outlinerKeymap = useRef(
    Extension.create({
      name: 'outlinerKeymap',
      addKeyboardShortcuts() {
        return {
          [KEY_EDITOR_ENTER]: ({ editor }) => {
            const intent = resolveNodeEditorEnterIntent({
              referenceActive: callbacksRef.current.referenceActive,
              hashTagActive: callbacksRef.current.hashTagActive,
              slashActive: callbacksRef.current.slashActive,
            });
            // Dropdown active: confirm selection
            if (intent === 'reference_confirm') {
              callbacksRef.current.onReferenceConfirm();
              return true;
            }
            if (intent === 'hashtag_confirm') {
              callbacksRef.current.onHashTagConfirm();
              return true;
            }
            if (intent === 'slash_confirm') {
              callbacksRef.current.onSlashConfirm();
              return true;
            }

            const { from } = editor.state.selection;
            const { doc, schema } = editor.state;
            const docEnd = doc.content.size - 1;

            if (from >= docEnd) {
              // Cursor at end: save + create empty sibling
              const html = editor.getHTML();
              callbacksRef.current.saveContent(html);
              callbacksRef.current.onEnter();
            } else {
              // Cursor in middle: split the node
              const para = doc.firstChild!;
              const paraOffset = from - 1; // position 1 = start of paragraph content
              const afterFragment = para.content.cut(paraOffset);

              // Serialize after-content to HTML
              const serializer = DOMSerializer.fromSchema(schema);
              const div = document.createElement('div');
              div.appendChild(serializer.serializeFragment(afterFragment));
              const afterHtml = div.innerHTML;

              // Delete after-content from editor
              editor.chain().command(({ tr }) => {
                tr.delete(from, docEnd);
                return true;
              }).run();

              // Save before-content
              const beforeHtml = editor.getHTML();
              callbacksRef.current.saveContent(beforeHtml);

              // Create new node with after-content
              callbacksRef.current.onEnter(afterHtml);
            }
            return true;
          },
          [KEY_EDITOR_INDENT]: () => {
            callbacksRef.current.onIndent();
            return true;
          },
          [KEY_EDITOR_OUTDENT]: () => {
            callbacksRef.current.onOutdent();
            return true;
          },
          [KEY_EDITOR_BACKSPACE]: ({ editor }) => {
            // Intercept when editor is visually empty (trim catches \n from <br>)
            const isEmpty = editor.state.doc.textContent.trim().length === 0;
            if (isEmpty) {
              // Explicitly flush empty name to store so handleDelete sees name=''
              // (onUpdate's setNodeNameLocal may not have fired yet due to
              // DOMObserver async timing)
              const { setNodeNameLocal: setLocal, nodeId: nid } = callbacksRef.current;
              setLocal(nid, '');
              callbacksRef.current.saveContent(editor.getHTML());
              const deleted = callbacksRef.current.onDelete();
              return deleted;
            }
            return false; // Let TipTap handle normal backspace
          },
          [KEY_EDITOR_ARROW_UP]: ({ editor }) => {
            const { from } = editor.state.selection;
            const intent = resolveNodeEditorArrowIntent({
              referenceActive: callbacksRef.current.referenceActive,
              hashTagActive: callbacksRef.current.hashTagActive,
              slashActive: callbacksRef.current.slashActive,
              isAtBoundary: from <= 1,
            });
            // Dropdown navigation
            if (intent === 'reference_nav') {
              callbacksRef.current.onReferenceNavUp();
              return true;
            }
            if (intent === 'hashtag_nav') {
              callbacksRef.current.onHashTagNavUp();
              return true;
            }
            if (intent === 'slash_nav') {
              callbacksRef.current.onSlashNavUp();
              return true;
            }
            // Only intercept when cursor is at the start
            if (intent === 'navigate_outliner') {
              callbacksRef.current.onArrowUp();
              return true;
            }
            return false;
          },
          [KEY_EDITOR_ARROW_DOWN]: ({ editor }) => {
            const { to } = editor.state.selection;
            const endPos = editor.state.doc.content.size - 1;
            const intent = resolveNodeEditorArrowIntent({
              referenceActive: callbacksRef.current.referenceActive,
              hashTagActive: callbacksRef.current.hashTagActive,
              slashActive: callbacksRef.current.slashActive,
              isAtBoundary: to >= endPos,
            });
            // Dropdown navigation
            if (intent === 'reference_nav') {
              callbacksRef.current.onReferenceNavDown();
              return true;
            }
            if (intent === 'hashtag_nav') {
              callbacksRef.current.onHashTagNavDown();
              return true;
            }
            if (intent === 'slash_nav') {
              callbacksRef.current.onSlashNavDown();
              return true;
            }
            // Only intercept when cursor is at the end
            if (intent === 'navigate_outliner') {
              callbacksRef.current.onArrowDown();
              return true;
            }
            return false;
          },
          [KEY_EDITOR_ESCAPE]: ({ editor }) => {
            const intent = resolveNodeEditorEscapeIntent(
              callbacksRef.current.referenceActive,
              callbacksRef.current.hashTagActive,
              callbacksRef.current.slashActive,
            );
            if (intent === 'reference_close') {
              callbacksRef.current.onReferenceClose();
              return true;
            }
            if (intent === 'hashtag_close') {
              callbacksRef.current.onHashTagClose();
              return true;
            }
            if (intent === 'slash_close') {
              callbacksRef.current.onSlashClose();
              return true;
            }
            if (intent === 'select_current') {
              callbacksRef.current.saveContent(editor.getHTML());
              callbacksRef.current.onEscapeSelect();
              return true;
            }
            return false;
          },
          'Shift-ArrowUp': ({ editor }) => {
            callbacksRef.current.saveContent(editor.getHTML());
            callbacksRef.current.onShiftArrow('up');
            return true;
          },
          'Shift-ArrowDown': ({ editor }) => {
            callbacksRef.current.saveContent(editor.getHTML());
            callbacksRef.current.onShiftArrow('down');
            return true;
          },
          [KEY_EDITOR_DROPDOWN_FORCE_CREATE]: () => {
            const intent = resolveNodeEditorForceCreateIntent(
              callbacksRef.current.referenceActive,
              callbacksRef.current.hashTagActive,
              callbacksRef.current.slashActive,
            );
            if (intent === 'reference_create') {
              callbacksRef.current.onReferenceCreate();
              return true;
            }
            if (intent === 'hashtag_create') {
              callbacksRef.current.onHashTagCreate();
              return true;
            }
            if (intent === 'noop') {
              return true;
            }
            // No dropdown active: toggle done state
            callbacksRef.current.onToggleDone();
            return true;
          },
          [KEY_EDITOR_MOVE_UP]: () => {
            callbacksRef.current.onMoveUp();
            return true;
          },
          [KEY_EDITOR_MOVE_DOWN]: () => {
            callbacksRef.current.onMoveDown();
            return true;
          },
          [KEY_EDITOR_EDIT_DESC_PRIMARY]: () => {
            callbacksRef.current.onDescriptionEdit();
            return true;
          },
          ...(KEY_EDITOR_EDIT_DESC_SECONDARY
            ? {
                [KEY_EDITOR_EDIT_DESC_SECONDARY]: () => {
                  callbacksRef.current.onDescriptionEdit();
                  return true;
                },
              }
            : {}),
        };
      },
    }),
  ).current;

  // Memoize ALL non-callback options to prevent TipTap's useEditor from
  // calling editor.setOptions() on every re-render. setOptions() triggers
  // view.updateState() which stops/restarts ProseMirror's DOMObserver,
  // disrupting pending DOM mutations (typed characters like # or @).
  //
  // TipTap v3's compareOptions skips callbacks (onBlur etc.) and does
  // element-by-element comparison for extensions, but uses strict reference
  // comparison (===) for editorProps and other options. Without memoization,
  // a new editorProps object each render triggers setOptions every time.
  // Italic mark without keyboard shortcuts — Mod-i is reassigned to description editing.
  // StarterKit's built-in Italic extension is disabled to prevent its Mod-i binding
  // from intercepting our custom keymap.
  const ItalicNoShortcut = useMemo(() => Italic.extend({
    addKeyboardShortcuts() { return {}; },
  }), []);

  const extensions = useMemo(() => [
    StarterKit.configure({
      italic: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false, // Nodes are single-line; also frees Mod-Enter for checkbox toggle
    }),
    ItalicNoShortcut,
    Highlight,
    InlineRefNode,
    outlinerKeymap,
    HashTagExtension.configure({ callbacks: hashTagRef }),
    FieldTriggerExtension.configure({ callbacks: fieldTriggerRef }),
    ReferenceExtension.configure({ callbacks: referenceRef }),
    SlashCommandExtension.configure({ callbacks: slashRef }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ItalicNoShortcut]);

  const editorProps = useMemo(() => ({
    attributes: {
      class: 'outline-none text-sm leading-[21px]',
    },
  }), []);

  // Live-update store on each keystroke so references/displays update in real-time.
  // Uses setNodeNameLocal (no Supabase) — the final blur/save handles persistence.
  const liveUpdateRef = useRef({ setNodeNameLocal, nodeId });
  liveUpdateRef.current = { setNodeNameLocal, nodeId };

  const editor = useEditor({
    extensions,
    content: wrapInP(initialContent),
    editorProps,
    onUpdate: ({ editor }) => {
      const { setNodeNameLocal: setLocal, nodeId: nid } = liveUpdateRef.current;
      const cleaned = stripWrappingP(editor.getHTML());
      setLocal(nid, cleaned);
    },
    onBlur: ({ editor }) => {
      if (!savedRef.current) {
        saveContent(editor.getHTML());
      }
      onBlur();
    },
  });

  // Auto-focus when mounted — use useLayoutEffect so focus is set synchronously
  // BEFORE paint. This prevents a gap where the editor is in the DOM but unfocused
  // (e.g., after indent moves a node, old editor unmounts and new one mounts —
  // if focus is deferred to useEffect, the user's next keypress goes to body).
  // Also reset savedRef: React Strict Mode double-invokes effects in dev,
  // which triggers the cleanup save (harmlessly, since content is unchanged)
  // but leaves savedRef.current = true. Resetting here ensures the real
  // editing session can save correctly.
  useLayoutEffect(() => {
    if (editor && !editor.isDestroyed) {
      savedRef.current = false;

      // Always focus first (at 'end', which works reliably) to ensure
      // the editor receives browser focus. Then adjust cursor position.
      // This two-step approach avoids a race: focus(pmPos) sets selection
      // THEN focuses, but the browser's async focus handling can override
      // the DOM selection for formatted text (bold/code/highlight marks).
      // By focusing first, the contenteditable is stable when we set selection.
      editor.commands.focus('end');

      const initialClickOffset = initialClickOffsetRef.current;
      if (initialClickOffset !== null) {
        try {
          const maxPos = editor.state.doc.content.size - 1;
          const pmPos = Math.max(1, Math.min(initialClickOffset + 1, maxPos));
          editor.commands.setTextSelection(pmPos);
        } catch { /* fallback: cursor stays at end */ }
      }

      const clickInfo = useUIStore.getState().focusClickCoords;
      if (clickInfo && clickInfo.nodeId === nodeId && clickInfo.parentId === parentId) {
        useUIStore.getState().setFocusClickCoords(null);
      }

      // Consume pending input character from selection mode (typed char → edit + append)
      const pendingChar = useUIStore.getState().pendingInputChar;
      if (pendingChar) {
        useUIStore.getState().setPendingInputChar(null);
        editor.commands.insertContent(pendingChar);
      }

      if (editorRef) editorRef.current = editor;
    }
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef, nodeId, parentId]);

  // Cleanup: save on unmount if not already saved
  useEffect(() => {
    return () => {
      if (editor && !editor.isDestroyed && !savedRef.current) {
        saveContent(editor.getHTML());
      }
    };
  }, [editor, saveContent]);

  if (!editor) return null;

  return (
    <div className="editor-inline">
      <EditorContent editor={editor} />
    </div>
  );
}
