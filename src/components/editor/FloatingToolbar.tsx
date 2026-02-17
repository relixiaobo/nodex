import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { Bold, Check, Code2, Heading, Highlighter, Italic, Link2, Strikethrough, Unlink, X } from 'lucide-react';

interface FloatingToolbarProps {
  editor: Editor;
}

interface ToolbarPosition {
  show: boolean;
  top: number;
  left: number;
}

const TOOLBAR_TOP_OFFSET = 40;
const TOOLBAR_VIEWPORT_PADDING = 8;
const TOOLBAR_DEFAULT_WIDTH = 232;
const TOOLBAR_LINK_WIDTH = 360;

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

function isTextSelectionRange(selection: { from: number; to: number; constructor?: { name?: string } }) {
  const constructorName = selection.constructor?.name;
  const isText = selection instanceof TextSelection || constructorName === 'TextSelection';
  return isText && selection.from !== selection.to;
}

function clampToolbarPosition(rawTop: number, rawLeft: number, toolbarWidth: number) {
  if (typeof document === 'undefined') {
    return { top: rawTop, left: rawLeft };
  }

  const viewportWidth = document.documentElement.clientWidth;
  const minLeft = TOOLBAR_VIEWPORT_PADDING + toolbarWidth / 2;
  const maxLeft = viewportWidth - TOOLBAR_VIEWPORT_PADDING - toolbarWidth / 2;
  const left = viewportWidth > 0 ? Math.max(minLeft, Math.min(rawLeft, maxLeft)) : rawLeft;
  const top = Math.max(TOOLBAR_VIEWPORT_PADDING, rawTop);

  return { top, left };
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const [renderTick, setRenderTick] = useState(0);
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ show: false, top: 0, left: 0 });
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerSelectingRef = useRef(false);

  const hideToolbar = useCallback(() => {
    setToolbarPosition((prev) => (prev.show ? { ...prev, show: false } : prev));
  }, []);

  const updateToolbarFromSelection = useCallback(() => {
    const selection = editor.state.selection;
    const hasTextSelection = isTextSelectionRange(selection);
    const shouldShow = editor.isEditable && editor.view.hasFocus() && hasTextSelection && !pointerSelectingRef.current;

    if (!shouldShow) {
      hideToolbar();
      return false;
    }

    try {
      const start = editor.view.coordsAtPos(selection.from);
      const end = editor.view.coordsAtPos(selection.to);
      const top = Math.min(start.top, end.top) - TOOLBAR_TOP_OFFSET;
      const left = (start.left + end.left) / 2;

      setToolbarPosition((prev) => {
        if (prev.show && prev.top === top && prev.left === left) {
          return prev;
        }
        return { show: true, top, left };
      });

      return true;
    } catch {
      hideToolbar();
      return false;
    }
  }, [editor, hideToolbar]);

  useEffect(() => {
    const syncToolbar = () => {
      updateToolbarFromSelection();
      setRenderTick((value) => value + 1);
    };
    const handleBlur = () => {
      pointerSelectingRef.current = false;
      setEditingLink(false);
      hideToolbar();
      setRenderTick((value) => value + 1);
    };

    editor.on('selectionUpdate', syncToolbar);
    editor.on('transaction', syncToolbar);
    editor.on('focus', syncToolbar);
    editor.on('blur', handleBlur);

    syncToolbar();

    return () => {
      editor.off('selectionUpdate', syncToolbar);
      editor.off('transaction', syncToolbar);
      editor.off('focus', syncToolbar);
      editor.off('blur', handleBlur);
    };
  }, [editor, hideToolbar, updateToolbarFromSelection]);

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      pointerSelectingRef.current = true;
      hideToolbar();
    };
    const handleMouseUp = () => {
      if (!pointerSelectingRef.current) return;
      pointerSelectingRef.current = false;
      requestAnimationFrame(() => {
        updateToolbarFromSelection();
        setRenderTick((value) => value + 1);
      });
    };
    const handleWindowBlur = () => {
      pointerSelectingRef.current = false;
    };

    editor.view.dom.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      editor.view.dom.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [editor, hideToolbar, updateToolbarFromSelection]);

  useEffect(() => {
    if (!editingLink) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editingLink]);

  useEffect(() => {
    if (!editingLink) return;
    if (!toolbarPosition.show || editor.state.selection.empty) {
      setEditingLink(false);
    }
  }, [editor, editingLink, toolbarPosition.show, renderTick]);

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
    updateToolbarFromSelection();
    setRenderTick((value) => value + 1);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setEditingLink(false);
    updateToolbarFromSelection();
    setRenderTick((value) => value + 1);
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

  const toolbarPositionStyle = useMemo(() => {
    const toolbarWidth = editingLink ? TOOLBAR_LINK_WIDTH : TOOLBAR_DEFAULT_WIDTH;
    const { top, left } = clampToolbarPosition(toolbarPosition.top, toolbarPosition.left, toolbarWidth);
    return { top: `${top}px`, left: `${left}px` };
  }, [editingLink, toolbarPosition.left, toolbarPosition.top]);

  if (!toolbarPosition.show || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      data-testid="floating-toolbar"
      className="fixed z-50 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-lg"
      style={{
        top: toolbarPositionStyle.top,
        left: toolbarPositionStyle.left,
        transform: 'translateX(-50%)',
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <div
        className="flex items-center gap-0.5"
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
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
            <ToolbarButton
              title="Bold"
              active={state.isBold}
              onClick={() => {
                editor.chain().focus().toggleBold().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={state.isItalic}
              onClick={() => {
                editor.chain().focus().toggleItalic().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Strikethrough"
              active={state.isStrike}
              onClick={() => {
                editor.chain().focus().toggleStrike().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Strikethrough size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Code"
              active={state.isCode}
              onClick={() => {
                editor.chain().focus().toggleCode().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Code2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Highlight"
              active={state.isHighlight}
              onClick={() => {
                editor.chain().focus().toggleHighlight().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Highlighter size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Heading"
              active={state.isHeading}
              onClick={() => {
                editor.chain().focus().toggleHeadingMark().run();
                setRenderTick((value) => value + 1);
              }}
            >
              <Heading size={14} />
            </ToolbarButton>
            <ToolbarButton title="Link" active={state.isLink} onClick={openLinkEditor}>
              <Link2 size={14} />
            </ToolbarButton>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
