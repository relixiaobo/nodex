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
import { DOMSerializer } from '@tiptap/pm/model';
import { useNodeStore } from '../../stores/node-store';
import { useUIStore } from '../../stores/ui-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { HashTagExtension, type HashTagCallbacks } from './HashTagExtension';
import { FieldTriggerExtension, type FieldTriggerCallbacks } from './FieldTriggerExtension';
import { ReferenceExtension, type ReferenceCallbacks } from './ReferenceExtension';
import { InlineRefNode } from './InlineRefNode';

interface NodeEditorProps {
  nodeId: string;
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
}

export function NodeEditor({
  nodeId,
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
}: NodeEditorProps) {
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const setNodeNameLocal = useNodeStore((s) => s.setNodeNameLocal);
  const userId = useWorkspaceStore((s) => s.userId);
  const savedRef = useRef(false);
  // Cache click info across React Strict Mode double-invocations.
  // First invocation reads from store + saves here; second invocation reads from ref.
  const clickInfoRef = useRef<{ textOffset: number } | null>(null);

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

  const outlinerKeymap = useRef(
    Extension.create({
      name: 'outlinerKeymap',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            // Dropdown active: confirm selection
            if (callbacksRef.current.referenceActive) {
              callbacksRef.current.onReferenceConfirm();
              return true;
            }
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagConfirm();
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
          Tab: () => {
            callbacksRef.current.onIndent();
            return true;
          },
          'Shift-Tab': () => {
            callbacksRef.current.onOutdent();
            return true;
          },
          Backspace: ({ editor }) => {
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
          ArrowUp: ({ editor }) => {
            // Dropdown navigation
            if (callbacksRef.current.referenceActive) {
              callbacksRef.current.onReferenceNavUp();
              return true;
            }
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagNavUp();
              return true;
            }
            // Only intercept when cursor is at the start
            const { from } = editor.state.selection;
            if (from <= 1) {
              callbacksRef.current.onArrowUp();
              return true;
            }
            return false;
          },
          ArrowDown: ({ editor }) => {
            // Dropdown navigation
            if (callbacksRef.current.referenceActive) {
              callbacksRef.current.onReferenceNavDown();
              return true;
            }
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagNavDown();
              return true;
            }
            // Only intercept when cursor is at the end
            const { to } = editor.state.selection;
            const endPos = editor.state.doc.content.size - 1;
            if (to >= endPos) {
              callbacksRef.current.onArrowDown();
              return true;
            }
            return false;
          },
          Escape: () => {
            if (callbacksRef.current.referenceActive) {
              callbacksRef.current.onReferenceClose();
              return true;
            }
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagClose();
              return true;
            }
            return false;
          },
          'Mod-Enter': () => {
            if (callbacksRef.current.referenceActive) {
              callbacksRef.current.onReferenceCreate();
              return true;
            }
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagCreate();
              return true;
            }
            return false;
          },
          'Mod-Shift-ArrowUp': () => {
            callbacksRef.current.onMoveUp();
            return true;
          },
          'Mod-Shift-ArrowDown': () => {
            callbacksRef.current.onMoveDown();
            return true;
          },
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
  const extensions = useMemo(() => [
    StarterKit.configure({
      bulletList: false,
      orderedList: false,
      listItem: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    Highlight,
    InlineRefNode,
    outlinerKeymap,
    HashTagExtension.configure({ callbacks: hashTagRef }),
    FieldTriggerExtension.configure({ callbacks: fieldTriggerRef }),
    ReferenceExtension.configure({ callbacks: referenceRef }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

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

      // If the user clicked on text to focus this node, position cursor at
      // the click point using a pre-computed text offset. The offset was
      // calculated from the static (non-editable) content via caretRangeFromPoint
      // in handleContentClick — this avoids layout timing issues with rAF.
      // ProseMirror position = textOffset + 1 (offset 1 = paragraph start).
      //
      // React Strict Mode re-invokes this effect: the first run reads from the
      // store and caches in clickInfoRef; the second run reads from the ref.
      const storeInfo = useUIStore.getState().focusClickCoords;
      if (storeInfo) {
        clickInfoRef.current = storeInfo;
        useUIStore.getState().setFocusClickCoords(null);
      }

      const info = clickInfoRef.current;
      if (info) {
        const maxPos = editor.state.doc.content.size - 1;
        const pmPos = Math.max(1, Math.min(info.textOffset + 1, maxPos));
        // Focus first, then defer setTextSelection to next frame.
        // TipTap's focus() triggers async browser focus handling that can
        // reset the DOM selection. By deferring, we set the selection AFTER
        // the browser finishes focus processing, so it sticks.
        editor.commands.focus('end');
        requestAnimationFrame(() => {
          if (!editor.isDestroyed) {
            editor.commands.setTextSelection(pmPos);
          }
        });
      } else {
        editor.commands.focus('end');
      }

      if (editorRef) editorRef.current = editor;
    }
    return () => {
      if (editorRef) editorRef.current = null;
    };
  }, [editor, editorRef]);

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

function stripWrappingP(html: string): string {
  const trimmed = html.trim();
  const match = trimmed.match(/^<p>(.*)<\/p>$/s);
  if (match && !match[1].includes('<p>')) {
    return match[1];
  }
  return trimmed;
}

function wrapInP(content: string): string {
  if (!content) return '<p></p>';
  const trimmed = content.trim();
  if (trimmed.startsWith('<p>')) return trimmed;
  return `<p>${trimmed}</p>`;
}
