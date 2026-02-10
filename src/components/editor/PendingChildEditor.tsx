/**
 * Ephemeral editor for the "pending child" created when clicking
 * the chevron on a leaf node (Tana behavior).
 *
 * - No node exists yet — this is UI-only.
 * - Enter / blur with content → creates a real child node, clears pending.
 * - Blur with empty content / Escape → cancels, collapses parent.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

interface PendingChildEditorProps {
  onCommit: (name: string) => void;
  onCancel: () => void;
}

export function PendingChildEditor({ onCommit, onCancel }: PendingChildEditorProps) {
  const committedRef = useRef(false);

  const callbacksRef = useRef({ onCommit, onCancel });
  callbacksRef.current = { onCommit, onCancel };

  const keymap = useRef(
    Extension.create({
      name: 'pendingChildKeymap',
      addKeyboardShortcuts() {
        return {
          Enter: ({ editor }) => {
            const text = editor.state.doc.textContent.trim();
            if (text.length > 0) {
              committedRef.current = true;
              const html = editor.getHTML();
              const cleaned = stripWrappingP(html);
              callbacksRef.current.onCommit(cleaned);
            } else {
              committedRef.current = true;
              callbacksRef.current.onCancel();
            }
            return true;
          },
          Escape: () => {
            committedRef.current = true;
            callbacksRef.current.onCancel();
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
      keymap,
    ],
    content: '<p></p>',
    editorProps: {
      attributes: {
        class: 'outline-none text-sm leading-7',
      },
    },
    onBlur: ({ editor }) => {
      if (committedRef.current) return;
      committedRef.current = true;
      const text = editor.state.doc.textContent.trim();
      if (text.length > 0) {
        const html = editor.getHTML();
        const cleaned = stripWrappingP(html);
        callbacksRef.current.onCommit(cleaned);
      } else {
        callbacksRef.current.onCancel();
      }
    },
  });

  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.commands.focus('end');
    }
  }, [editor]);

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
