import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { toggleMark } from 'prosemirror-commands';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { Bold, Code2, Hash, Heading, Highlighter, Italic, Strikethrough } from '../../lib/icons.js';
import { pmSchema } from './pm-schema.js';
import { t } from '../../i18n/strings.js';
import { Tooltip } from '../ui/Tooltip';

interface FloatingToolbarProps {
 view?: EditorView | null;
 tick?: number;
 /** Called when user clicks # Tag button. Parent handles tag selection. */
 onTagClick?: () => void;
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
}

const TOOLBAR_TOP_OFFSET = 40;
const TOOLBAR_VIEWPORT_PADDING = 8;
const TOOLBAR_DEFAULT_WIDTH = 200;

interface ToolbarButtonProps {
 title: string;
 shortcut?: string;
 active?: boolean;
 onClick: () => void;
 children: ReactNode;
}

function ToolbarButton({ title, shortcut, active = false, onClick, children }: ToolbarButtonProps) {
 return (
  <Tooltip label={title} shortcut={shortcut} side="top">
   <button
    type="button"
    className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
     active
      ? 'bg-foreground/8 text-foreground'
      : 'text-foreground-secondary hover:bg-foreground/4 hover:text-foreground'
    }`}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
   >
    {children}
   </button>
  </Tooltip>
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

function toggleMarkInView(view: EditorView, markName: keyof typeof pmSchema.marks) {
 toggleMark(pmSchema.marks[markName])(view.state, view.dispatch, view);
 view.focus();
}

export function FloatingToolbar({ view, tick = 0, onTagClick }: FloatingToolbarProps) {
 const [renderTick, setRenderTick] = useState(0);
 const [toolbarPosition, setToolbarPosition] = useState<ToolbarPosition>({ show: false, top: 0, left: 0 });
 const pointerSelectingRef = useRef(false);

 const activeView = view ?? null;

 const hideToolbar = useCallback(() => {
  setToolbarPosition((prev) => (prev.show ? { ...prev, show: false } : prev));
 }, []);

 const updateToolbarFromSelection = useCallback(() => {
  if (!activeView) {
   hideToolbar();
   return false;
  }

  const selection = activeView.state.selection;
  const hasTextSelection = isTextSelectionRange(selection);
  const isEditable = !!activeView.editable;
  const shouldShow = isEditable && activeView.hasFocus() && hasTextSelection && !pointerSelectingRef.current;

  if (!shouldShow) {
   hideToolbar();
   return false;
  }

  try {
   const { anchor, head } = selection;
   const forward = head >= anchor;
   const selectionFrom = selection.from;
   const selectionTo = selection.to;
   const focusPos = forward
    ? Math.max(selectionFrom, selectionTo - 1)
    : selectionFrom;
   const focusRect = activeView.coordsAtPos(focusPos);
   const top = focusRect.top - TOOLBAR_TOP_OFFSET;
   const right = Number.isFinite(focusRect.right) ? focusRect.right : focusRect.left;
   const left = (focusRect.left + right) / 2;

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
 }, [activeView, hideToolbar]);

 useEffect(() => {
  if (!activeView) return;

  const syncToolbar = () => {
   updateToolbarFromSelection();
   setRenderTick((value) => value + 1);
  };

  const handleBlur = () => {
   pointerSelectingRef.current = false;
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
 }, [activeView, hideToolbar, updateToolbarFromSelection]);

 useEffect(() => {
  if (!activeView) return;

  updateToolbarFromSelection();
  setRenderTick((value) => value + 1);
 }, [activeView, tick, updateToolbarFromSelection]);

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

 const state = useMemo<ToolbarState>(() => {
  if (!activeView) {
   return {
    isBold: false,
    isItalic: false,
    isStrike: false,
    isCode: false,
    isHighlight: false,
    isHeading: false,
   };
  }

  return {
   isBold: isMarkActiveInView(activeView, 'bold'),
   isItalic: isMarkActiveInView(activeView, 'italic'),
   isStrike: isMarkActiveInView(activeView, 'strike'),
   isCode: isMarkActiveInView(activeView, 'code'),
   isHighlight: isMarkActiveInView(activeView, 'highlight'),
   isHeading: isMarkActiveInView(activeView, 'headingMark'),
  };
 }, [activeView, renderTick]);

 const toggleNamedMark = (markName: keyof typeof pmSchema.marks) => {
  if (activeView) {
   toggleMarkInView(activeView, markName);
  }
  setRenderTick((value) => value + 1);
 };

 const toolbarPositionStyle = useMemo(() => {
  const { top, left } = clampToolbarPosition(toolbarPosition.top, toolbarPosition.left, TOOLBAR_DEFAULT_WIDTH);
  return { top: `${top}px`, left: `${left}px` };
 }, [toolbarPosition.left, toolbarPosition.top]);

 if (!toolbarPosition.show || typeof document === 'undefined') {
  return null;
 }

 return createPortal(
  <div
   data-testid="floating-toolbar"
   className="fixed z-50 flex items-center gap-0.5 rounded-lg bg-background shadow-paper p-1"
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
    <ToolbarButton
     title={t('floatingToolbar.bold')}
     shortcut="⌘B"
     active={state.isBold}
     onClick={() => toggleNamedMark('bold')}
    >
     <Bold size={14} />
    </ToolbarButton>
    <ToolbarButton
     title={t('floatingToolbar.italic')}
     shortcut="⌘I"
     active={state.isItalic}
     onClick={() => toggleNamedMark('italic')}
    >
     <Italic size={14} />
    </ToolbarButton>
    <ToolbarButton
     title={t('floatingToolbar.strikethrough')}
     shortcut="⌘⇧S"
     active={state.isStrike}
     onClick={() => toggleNamedMark('strike')}
    >
     <Strikethrough size={14} />
    </ToolbarButton>
    <ToolbarButton
     title={t('floatingToolbar.code')}
     shortcut="⌘E"
     active={state.isCode}
     onClick={() => toggleNamedMark('code')}
    >
     <Code2 size={14} />
    </ToolbarButton>
    <ToolbarButton
     title={t('floatingToolbar.highlight')}
     shortcut="⌘⇧H"
     active={state.isHighlight}
     onClick={() => toggleNamedMark('highlight')}
    >
     <Highlighter size={14} />
    </ToolbarButton>
    <ToolbarButton
     title={t('floatingToolbar.heading')}
     active={state.isHeading}
     onClick={() => toggleNamedMark('headingMark')}
    >
     <Heading size={14} />
    </ToolbarButton>

    {/* Separator */}
    <div className="mx-0.5 h-4 w-px bg-foreground/10" />

    {/* # Tag — extract selection to tagged Library node */}
    <ToolbarButton
     title={t('floatingToolbar.tag')}
     onClick={() => onTagClick?.()}
    >
     <Hash size={14} />
    </ToolbarButton>
   </div>
  </div>,
  document.body,
 );
}
