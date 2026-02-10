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
import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { useNodeStore } from '../../stores/node-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

interface NodeEditorProps {
  nodeId: string;
  initialContent: string;
  onBlur: () => void;
  onEnter: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onDelete: () => boolean; // returns true if node was deleted
  onArrowUp: () => void;
  onArrowDown: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
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
  const callbacksRef = useRef({ onEnter, onIndent, onOutdent, onDelete, onArrowUp, onArrowDown, onMoveUp, onMoveDown, saveContent });
  callbacksRef.current = { onEnter, onIndent, onOutdent, onDelete, onArrowUp, onArrowDown, onMoveUp, onMoveDown, saveContent };

  const outlinerKeymap = useRef(
    Extension.create({
      name: 'outlinerKeymap',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            // Save current content, then create sibling
            const html = editor.getHTML();
            callbacksRef.current.saveContent(html);
            callbacksRef.current.onEnter();
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
              const deleted = callbacksRef.current.onDelete();
              return deleted;
            }
            return false; // Let TipTap handle normal backspace
          },
          ArrowUp: ({ editor }) => {
            // Only intercept when cursor is at the start
            const { from } = editor.state.selection;
            if (from <= 1) {
              callbacksRef.current.onArrowUp();
              return true;
            }
            return false;
          },
          ArrowDown: ({ editor }) => {
            // Only intercept when cursor is at the end
            const { to } = editor.state.selection;
            const endPos = editor.state.doc.content.size - 1;
            if (to >= endPos) {
              callbacksRef.current.onArrowDown();
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
      Placeholder.configure({
        placeholder: 'Type something...',
      }),
      outlinerKeymap,
    ],
    content: wrapInP(initialContent),
    editorProps: {
      attributes: {
        class: 'outline-none text-sm leading-7',
      },
    },
    onBlur: ({ editor }) => {
      if (!savedRef.current) {
        saveContent(editor.getHTML());
      }
      onBlur();
    },
  });

  // Auto-focus when mounted
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.focus('end');
    }
  }, [editor]);

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
    <div className="flex-1 min-w-0">
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
