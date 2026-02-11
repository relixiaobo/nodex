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
import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import { DOMSerializer } from '@tiptap/pm/model';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { HashTagExtension, type HashTagCallbacks } from './HashTagExtension';
import { FieldTriggerExtension, type FieldTriggerCallbacks } from './FieldTriggerExtension';

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
}: NodeEditorProps) {
  const updateNodeName = useNodeStore((s) => s.updateNodeName);
  const userId = useWorkspaceStore((s) => s.userId);
  const savedRef = useRef(false);

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
    hashTagActive: hashTagActive ?? false,
    onHashTagConfirm: onHashTagConfirm ?? (() => {}),
    onHashTagNavDown: onHashTagNavDown ?? (() => {}),
    onHashTagNavUp: onHashTagNavUp ?? (() => {}),
    onHashTagCreate: onHashTagCreate ?? (() => {}),
    onHashTagClose: onHashTagClose ?? (() => {}),
  });
  callbacksRef.current = {
    onEnter, onIndent, onOutdent, onDelete, onArrowUp, onArrowDown, onMoveUp, onMoveDown, saveContent,
    hashTagActive: hashTagActive ?? false,
    onHashTagConfirm: onHashTagConfirm ?? (() => {}),
    onHashTagNavDown: onHashTagNavDown ?? (() => {}),
    onHashTagNavUp: onHashTagNavUp ?? (() => {}),
    onHashTagCreate: onHashTagCreate ?? (() => {}),
    onHashTagClose: onHashTagClose ?? (() => {}),
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

  const outlinerKeymap = useRef(
    Extension.create({
      name: 'outlinerKeymap',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            // HashTag dropdown: confirm selection
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
            // Only intercept when editor is empty
            const isEmpty = editor.state.doc.textContent.length === 0;
            if (isEmpty) {
              // Flush empty content to store so handleDelete sees name=''
              callbacksRef.current.saveContent(editor.getHTML());
              const deleted = callbacksRef.current.onDelete();
              return deleted;
            }
            return false; // Let TipTap handle normal backspace
          },
          ArrowUp: ({ editor }) => {
            // HashTag dropdown: navigate up
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
            // HashTag dropdown: navigate down
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
            if (callbacksRef.current.hashTagActive) {
              callbacksRef.current.onHashTagClose();
              return true;
            }
            return false;
          },
          'Mod-Enter': () => {
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

  const editor = useEditor({
    extensions: [
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
      outlinerKeymap,
      HashTagExtension.configure({ callbacks: hashTagRef }),
      FieldTriggerExtension.configure({ callbacks: fieldTriggerRef }),
    ],
    content: wrapInP(initialContent),
    editorProps: {
      attributes: {
        class: 'outline-none text-sm leading-[21px]',
      },
    },
    onBlur: ({ editor }) => {
      if (!savedRef.current) {
        saveContent(editor.getHTML());
      }
      onBlur();
    },
  });

  // Auto-focus when mounted.
  // Also reset savedRef: React Strict Mode double-invokes effects in dev,
  // which triggers the cleanup save (harmlessly, since content is unchanged)
  // but leaves savedRef.current = true. Resetting here ensures the real
  // editing session can save correctly.
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      savedRef.current = false;
      editor.commands.focus('end');
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
