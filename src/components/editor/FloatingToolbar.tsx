import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Bold, Check, Code2, Heading, Highlighter, Italic, Link2, Strikethrough, Unlink, X } from 'lucide-react';

interface FloatingToolbarProps {
  editor: Editor;
}

function normalizeLinkHref(rawHref: string): string {
  const value = rawHref.trim();
  if (!value) return '';

  const withProtocol = /^[a-zA-Z][\w+.-]*:/.test(value) ? value : `https://${value}`;
  try {
    new URL(withProtocol);
    return withProtocol;
  } catch {
    return '';
  }
}

interface ToolbarButtonProps {
  title: string;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolbarButton({ title, active = false, onClick, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
        active
          ? 'bg-foreground/8 text-foreground'
          : 'text-foreground-secondary hover:bg-foreground/5 hover:text-foreground'
      }`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [renderTick, setRenderTick] = useState(0);
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const [isPointerSelecting, setIsPointerSelecting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const rerender = () => setRenderTick((value) => value + 1);
    const setPointerSelecting = (next: boolean) => {
      setIsPointerSelecting((previous) => (previous === next ? previous : next));
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!editor.view.dom.contains(target)) return;
      setPointerSelecting(true);
    };
    const handleMouseUp = () => {
      setPointerSelecting(false);
    };
    const handleWindowBlur = () => {
      setPointerSelecting(false);
    };

    // Only listen to selectionUpdate and blur — NOT transaction.
    // BubbleMenu dispatches transactions internally (updateOptions meta),
    // so listening to 'transaction' creates an infinite render loop:
    // render → new shouldShow/options refs → BubbleMenu dispatches tx → rerender → repeat.
    editor.on('selectionUpdate', rerender);
    editor.on('blur', rerender);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      editor.off('selectionUpdate', rerender);
      editor.off('blur', rerender);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [editor]);

  useEffect(() => {
    if (!editingLink) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editingLink]);

  useEffect(() => {
    if (!editingLink) return;
    if (editor.state.selection.empty) {
      setEditingLink(false);
    }
  }, [editor, editingLink, renderTick]);

  const state = useMemo(() => {
    const href = editor.getAttributes('link').href;
    return {
      isBold: editor.isActive('bold'),
      isItalic: editor.isActive('italic'),
      isStrike: editor.isActive('strike'),
      isCode: editor.isActive('code'),
      isHighlight: editor.isActive('highlight'),
      isHeading: editor.isActive('headingMark'),
      isLink: editor.isActive('link'),
      currentHref: typeof href === 'string' ? href : '',
    };
  }, [editor, renderTick]);

  const openLinkEditor = () => {
    setLinkDraft(state.currentHref);
    setEditingLink(true);
  };

  const applyLink = () => {
    const normalizedHref = normalizeLinkHref(linkDraft);
    if (!normalizedHref) return;

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run();
    setEditingLink(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEditingLink(false);
  };

  const handleLinkInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyLink();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setEditingLink(false);
    }
  };

  // Memoize BubbleMenu props to prevent infinite render loops.
  // BubbleMenu's useEffect dispatches transactions when these references change,
  // which would re-trigger our selectionUpdate listener → setState → re-render.
  const shouldShow = useCallback(
    ({
      editor: currentEditor,
      view,
      from,
      to,
    }: {
      editor: Editor;
      view: { hasFocus: () => boolean };
      from: number;
      to: number;
    }) => {
      // Delay toolbar display until pointer selection finishes (mouse up),
      // so drag-select and double-click don't flash the menu mid-gesture.
      if (isPointerSelecting) return false;
      return currentEditor.isEditable && view.hasFocus() && from !== to;
    },
    [isPointerSelecting],
  );

  const bubbleMenuOptions = useMemo(() => ({
    placement: 'top' as const,
    strategy: 'fixed' as const,
    offset: 8,
  }), []);

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={0}
      shouldShow={shouldShow}
      options={bubbleMenuOptions}
    >
      <div
        className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
        onMouseDown={(event) => event.preventDefault()}
      >
        {editingLink ? (
          <div className="flex items-center gap-1">
            <Link2 size={14} className="shrink-0 text-foreground-secondary" />
            <input
              ref={inputRef}
              value={linkDraft}
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={handleLinkInputKeyDown}
              placeholder="https://example.com"
              className="h-7 w-56 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              title="Apply link"
              className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-secondary transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={applyLink}
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              title="Cancel"
              className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-secondary transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setEditingLink(false)}
            >
              <X size={14} />
            </button>
            {state.isLink && (
              <button
                type="button"
                title="Remove link"
                className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-secondary transition-colors duration-150 hover:bg-foreground/5 hover:text-foreground"
                onMouseDown={(event) => event.preventDefault()}
                onClick={removeLink}
              >
                <Unlink size={14} />
              </button>
            )}
          </div>
        ) : (
          <>
            <ToolbarButton title="Bold" active={state.isBold} onClick={() => editor.chain().focus().toggleBold().run()}>
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton title="Italic" active={state.isItalic} onClick={() => editor.chain().focus().toggleItalic().run()}>
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton title="Strikethrough" active={state.isStrike} onClick={() => editor.chain().focus().toggleStrike().run()}>
              <Strikethrough size={14} />
            </ToolbarButton>
            <ToolbarButton title="Code" active={state.isCode} onClick={() => editor.chain().focus().toggleCode().run()}>
              <Code2 size={14} />
            </ToolbarButton>
            <ToolbarButton title="Highlight" active={state.isHighlight} onClick={() => editor.chain().focus().toggleHighlight().run()}>
              <Highlighter size={14} />
            </ToolbarButton>
            <ToolbarButton title="Heading" active={state.isHeading} onClick={() => editor.chain().focus().toggleHeadingMark().run()}>
              <Heading size={14} />
            </ToolbarButton>
            <ToolbarButton title="Link" active={state.isLink} onClick={openLinkEditor}>
              <Link2 size={14} />
            </ToolbarButton>
          </>
        )}
      </div>
    </BubbleMenu>
  );
}
