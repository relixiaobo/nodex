import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toggleMark } from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Bold, Check, Code2, Heading, Highlighter, Italic, Link2, Strikethrough, Unlink, X } from 'lucide-react';
import { pmSchema } from './pm-schema.js';

interface TiptapLikeChain {
  focus: () => TiptapLikeChain;
  extendMarkRange: (_mark: string) => TiptapLikeChain;
  setLink: (_attrs: { href: string }) => TiptapLikeChain;
  unsetLink: () => TiptapLikeChain;
  toggleBold: () => TiptapLikeChain;
  toggleItalic: () => TiptapLikeChain;
  toggleStrike: () => TiptapLikeChain;
  toggleCode: () => TiptapLikeChain;
  toggleHighlight: () => TiptapLikeChain;
  toggleHeadingMark: () => TiptapLikeChain;
  run: () => boolean;
}

interface TiptapLikeEditor {
  state: { selection: { from: number; to: number; empty?: boolean; constructor?: { name?: string } } };
  isEditable: boolean;
  view: EditorView;
  on: (_event: string, _callback: () => void) => void;
  off: (_event: string, _callback: () => void) => void;
  getAttributes: (_mark: string) => { href?: string };
  isActive: (_mark: string) => boolean;
  chain: () => TiptapLikeChain;
}

interface FloatingToolbarProps {
  editor?: TiptapLikeEditor;
  view?: EditorView | null;
  tick?: number;
}

interface ToolbarPosition {
  show: boolean;
  top: number;
  left: number;
}

interface ToolbarState {
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
  isCode: boolean;
  isHighlight: boolean;
  isHeading: boolean;
  isLink: boolean;
  currentHref: string;
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

function isMarkActiveInView(view: EditorView, markName: keyof typeof pmSchema.marks): boolean {
  const markType = pmSchema.marks[markName];
  const { from, to, empty, $from } = view.state.selection;

  if (empty) {
    return markType.isInSet(view.state.storedMarks || $from.marks()) !== null;
  }

  let hasText = false;
  let allHave = true;
  view.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return;
    hasText = true;
    if (!markType.isInSet(node.marks)) {
      allHave = false;
    }
  });

  return hasText && allHave;
}

function getCurrentLinkHrefInView(view: EditorView): string {
  const markType = pmSchema.marks.link;
  const { from, to, empty, $from } = view.state.selection;

  if (empty) {
    const mark = markType.isInSet(view.state.storedMarks || $from.marks());
    const href = mark?.attrs?.href;
    return typeof href === 'string' ? href : '';
  }

  let href = '';
  view.state.doc.nodesBetween(from, to, (node) => {
    if (!node.isText || href) return;
    const mark = markType.isInSet(node.marks);
    const current = mark?.attrs?.href;
    if (typeof current === 'string') {
      href = current;
    }
  });

  return href;
}

function toggleMarkInView(view: EditorView, markName: keyof typeof pmSchema.marks) {
  toggleMark(pmSchema.marks[markName])(view.state, view.dispatch, view);
  view.focus();
}

function applyLinkInView(view: EditorView, href: string) {
  const { from, to } = view.state.selection;
  if (from === to) return;

  let tr = view.state.tr.removeMark(from, to, pmSchema.marks.link);
  tr = tr.addMark(from, to, pmSchema.marks.link.create({ href }));
  view.dispatch(tr);
  view.focus();
}

function removeLinkInView(view: EditorView) {
  const { from, to } = view.state.selection;
  if (from === to) return;

  const tr = view.state.tr.removeMark(from, to, pmSchema.marks.link);
  view.dispatch(tr);
  view.focus();
}

export function FloatingToolbar({ editor, view, tick = 0 }: FloatingToolbarProps) {
  const [renderTick, setRenderTick] = useState(0);
  const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ show: false, top: 0, left: 0 });
  const [editingLink, setEditingLink] = useState(false);
  const [linkDraft, setLinkDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const pointerSelectingRef = useRef(false);

  const activeView = view ?? editor?.view ?? null;

  const hideToolbar = useCallback(() => {
    setToolbarPosition((prev) => (prev.show ? { ...prev, show: false } : prev));
  }, []);

  const updateToolbarFromSelection = useCallback(() => {
    if (!activeView) {
      hideToolbar();
      return false;
    }

    const selection = editor ? editor.state.selection : activeView.state.selection;
    const hasTextSelection = isTextSelectionRange(selection);
    const isEditable = editor ? editor.isEditable : !!activeView.editable;
    const shouldShow = isEditable && activeView.hasFocus() && hasTextSelection && !pointerSelectingRef.current;

    if (!shouldShow) {
      hideToolbar();
      return false;
    }

    try {
      const start = activeView.coordsAtPos(selection.from);
      // `coordsAtPos(selection.to)` can snap to next line start when the
      // selection ends at line boundary. Use the last selected char box for a
      // stable horizontal center near line endings.
      const endPos = Math.max(selection.from, selection.to - 1);
      const end = activeView.coordsAtPos(endPos);
      const top = Math.min(start.top, end.top) - TOOLBAR_TOP_OFFSET;
      const left = (start.left + end.right) / 2;

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
  }, [activeView, editor, hideToolbar]);

  useEffect(() => {
    if (!editor) return;

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
    if (editor || !activeView) return;

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

    activeView.dom.addEventListener('focus', syncToolbar, true);
    activeView.dom.addEventListener('blur', handleBlur, true);
    syncToolbar();

    return () => {
      activeView.dom.removeEventListener('focus', syncToolbar, true);
      activeView.dom.removeEventListener('blur', handleBlur, true);
    };
  }, [activeView, editor, hideToolbar, updateToolbarFromSelection]);

  useEffect(() => {
    if (editor || !activeView) return;

    updateToolbarFromSelection();
    setRenderTick((value) => value + 1);
  }, [activeView, editor, tick, updateToolbarFromSelection]);

  useEffect(() => {
    if (!activeView) return;

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

    activeView.dom.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      activeView.dom.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [activeView, hideToolbar, updateToolbarFromSelection]);

  useEffect(() => {
    if (!editingLink) return;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [editingLink]);

  useEffect(() => {
    if (!editingLink) return;
    if (!toolbarPosition.show) {
      setEditingLink(false);
      return;
    }

    const selection = editor ? editor.state.selection : activeView?.state.selection;
    if (!selection || selection.empty) {
      setEditingLink(false);
    }
  }, [activeView, editingLink, toolbarPosition.show, renderTick]);

  const state = useMemo<ToolbarState>(() => {
    if (editor) {
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
    }

    if (!activeView) {
      return {
        isBold: false,
        isItalic: false,
        isStrike: false,
        isCode: false,
        isHighlight: false,
        isHeading: false,
        isLink: false,
        currentHref: '',
      };
    }

    return {
      isBold: isMarkActiveInView(activeView, 'bold'),
      isItalic: isMarkActiveInView(activeView, 'italic'),
      isStrike: isMarkActiveInView(activeView, 'strike'),
      isCode: isMarkActiveInView(activeView, 'code'),
      isHighlight: isMarkActiveInView(activeView, 'highlight'),
      isHeading: isMarkActiveInView(activeView, 'headingMark'),
      isLink: isMarkActiveInView(activeView, 'link'),
      currentHref: getCurrentLinkHrefInView(activeView),
    };
  }, [activeView, editor, renderTick]);

  const toggleNamedMark = (markName: keyof typeof pmSchema.marks, tiptapToggle?: () => void) => {
    if (editor && tiptapToggle) {
      tiptapToggle();
    } else if (activeView) {
      toggleMarkInView(activeView, markName);
    }
    setRenderTick((value) => value + 1);
  };

  const openLinkEditor = () => {
    setLinkDraft(state.currentHref);
    setEditingLink(true);
  };

  const applyLink = () => {
    const normalizedHref = normalizeLinkHref(linkDraft);
    if (!normalizedHref) return;

    if (editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedHref }).run();
    } else if (activeView) {
      applyLinkInView(activeView, normalizedHref);
    }

    setEditingLink(false);
    updateToolbarFromSelection();
    setRenderTick((value) => value + 1);
  };

  const removeLink = () => {
    if (editor) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    } else if (activeView) {
      removeLinkInView(activeView);
    }

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
                toggleNamedMark('bold', () => editor?.chain().focus().toggleBold().run());
              }}
            >
              <Bold size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Italic"
              active={state.isItalic}
              onClick={() => {
                toggleNamedMark('italic', () => editor?.chain().focus().toggleItalic().run());
              }}
            >
              <Italic size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Strikethrough"
              active={state.isStrike}
              onClick={() => {
                toggleNamedMark('strike', () => editor?.chain().focus().toggleStrike().run());
              }}
            >
              <Strikethrough size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Code"
              active={state.isCode}
              onClick={() => {
                toggleNamedMark('code', () => editor?.chain().focus().toggleCode().run());
              }}
            >
              <Code2 size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Highlight"
              active={state.isHighlight}
              onClick={() => {
                toggleNamedMark('highlight', () => editor?.chain().focus().toggleHighlight().run());
              }}
            >
              <Highlighter size={14} />
            </ToolbarButton>
            <ToolbarButton
              title="Heading"
              active={state.isHeading}
              onClick={() => {
                toggleNamedMark('headingMark', () => editor?.chain().focus().toggleHeadingMark().run());
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
