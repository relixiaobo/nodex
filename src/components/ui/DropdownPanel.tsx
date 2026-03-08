/**
 * DropdownPanel — shared floating panel primitive for toolbar dropdowns.
 *
 * Portal-based, auto-positioned relative to an anchor element.
 * Follows the same pattern as TagSelector/ReferenceSelector (the most
 * battle-tested floating UI in this codebase).
 *
 * Positioning strategy:
 * 1. useLayoutEffect for sync position (no flash)
 * 2. Vertical: prefer below anchor, flip above when space below < 200px
 * 3. Horizontal: left-aligned with anchor, shift left if overflows right
 * 4. Scroll(capture) + resize listeners for live repositioning
 * 5. Outside click + Escape to close
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownPanelProps {
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: number;
}

export function DropdownPanel({
  anchorRef,
  onClose,
  title,
  children,
  width = 260,
}: DropdownPanelProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Dismiss on outside click / Escape ──
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [anchorRef, onClose]);

  // ── Position: sync layout, live reposition on scroll/resize ──
  const [style, setStyle] = useState<React.CSSProperties>({
    position: 'fixed',
    top: -9999,
    left: -9999,
  });

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const update = () => {
      const rect = anchor.getBoundingClientRect();
      const gap = 4;
      const margin = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Horizontal: left-aligned, shift left if overflows right
      const left = Math.max(margin, Math.min(rect.left, vw - width - margin));

      // Vertical: prefer below, flip above if space below < 200px
      const spaceBelow = vh - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      let top: number;
      let maxHeight: number;

      if (spaceBelow >= 200) {
        top = rect.bottom + gap;
        maxHeight = spaceBelow - margin;
      } else if (spaceAbove > spaceBelow) {
        maxHeight = Math.min(spaceAbove - margin, 400);
        // Measure actual content height to position correctly
        const contentH = menuRef.current?.scrollHeight ?? maxHeight;
        const dropH = Math.min(contentH, maxHeight);
        top = rect.top - gap - dropH;
      } else {
        top = rect.bottom + gap;
        maxHeight = spaceBelow - margin;
      }

      setStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxHeight: Math.max(maxHeight, 100),
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [anchorRef, width]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 rounded-lg bg-background shadow-paper text-foreground overflow-y-auto"
      style={style}
    >
      {title && (
        <div className="px-3 pt-2.5 pb-1.5 text-xs font-medium text-foreground-secondary">
          {title}
        </div>
      )}
      {children}
    </div>,
    document.body,
  );
}
