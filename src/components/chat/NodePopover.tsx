/**
 * NodePopover — portal-based popover showing an OutlinerView for a node.
 *
 * Used by NodeReference and CitationBadge to show node details in-place
 * without navigating away from the chat. Includes an "Open in panel" button.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';
import { OutlinerView } from '../outliner/OutlinerView.js';

const CHAT_POPOVER_PANEL_ID = 'chat';
const POPOVER_Z_INDEX = 1300;
const POPOVER_MAX_HEIGHT = 320;
const POPOVER_WIDTH = 320;
const EDGE_MARGIN = 8;

interface NodePopoverProps {
  nodeId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function NodePopover({ nodeId, anchorRect, onClose }: NodePopoverProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);
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
    if (left + POPOVER_WIDTH > window.innerWidth - EDGE_MARGIN) {
      left = window.innerWidth - POPOVER_WIDTH - EDGE_MARGIN;
    }
    if (left < EDGE_MARGIN) left = EDGE_MARGIN;

    // Clamp vertical
    if (top < EDGE_MARGIN) top = EDGE_MARGIN;

    setPosition({ top, left });
  }, [anchorRect]);

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

  const handleOpenInPanel = useCallback(() => {
    navigateTo(nodeId);
    onClose();
  }, [navigateTo, nodeId, onClose]);

  return createPortal(
    <div
      ref={popoverRef}
      className="rounded-lg bg-background shadow-paper overflow-hidden"
      style={{
        position: 'fixed',
        top: position?.top ?? -9999,
        left: position?.left ?? -9999,
        width: POPOVER_WIDTH,
        zIndex: POPOVER_Z_INDEX,
        // Hide until position is calculated
        opacity: position ? 1 : 0,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div
        className="overflow-y-auto py-1"
        style={{ maxHeight: POPOVER_MAX_HEIGHT }}
      >
        <OutlinerView rootNodeId={nodeId} panelId={CHAT_POPOVER_PANEL_ID} />
      </div>
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={handleOpenInPanel}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-surface hover:text-foreground"
        >
          <ExternalLink size={12} />
          Open in panel
        </button>
      </div>
    </div>,
    document.body,
  );
}
