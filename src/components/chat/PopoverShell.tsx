/**
 * PopoverShell — shared portal-based popover container.
 *
 * Handles positioning (flip above/below, clamp to edges), Esc to close,
 * and click-outside-to-close. Content is injected via children.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

const POPOVER_Z_INDEX = 1300;
const POPOVER_WIDTH = 320;
const EDGE_MARGIN = 8;

interface PopoverShellProps {
  anchorRect: DOMRect;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}

export function PopoverShell({ anchorRect, onClose, width = POPOVER_WIDTH, children }: PopoverShellProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // Calculate position after first render
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    let top = anchorRect.bottom + 4;
    let left = anchorRect.left;

    // Flip above if not enough space below
    if (top + rect.height > window.innerHeight - EDGE_MARGIN) {
      top = anchorRect.top - rect.height - 4;
    }
    // Clamp horizontal
    if (left + width > window.innerWidth - EDGE_MARGIN) {
      left = window.innerWidth - width - EDGE_MARGIN;
    }
    if (left < EDGE_MARGIN) left = EDGE_MARGIN;

    // Clamp vertical
    if (top < EDGE_MARGIN) top = EDGE_MARGIN;

    setPosition({ top, left });
  }, [anchorRect, width]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delay to avoid the trigger click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown, true);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={popoverRef}
      className="rounded-lg border border-border bg-background shadow-paper overflow-hidden"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width,
        zIndex: POPOVER_Z_INDEX,
        opacity: position ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  );
}
