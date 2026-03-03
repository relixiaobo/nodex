/**
 * Node right-click context menu.
 *
 * Portal-based, positioned at click coordinates.
 * Shows Copy, Cut, Delete actions + Created/Changed timestamps.
 */
import { useEffect, useRef, forwardRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNodeStore } from '../../stores/node-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { copyNodesToClipboard, cutNodesToClipboard } from '../../lib/node-clipboard.js';
import { Kbd } from '../ui/Kbd.js';

// ── Timestamp formatting ──

const dateFmt = new Intl.DateTimeFormat('en', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const timeFmt = new Intl.DateTimeFormat('en', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

/**
 * Format a ms timestamp to { date, time } for context menu display.
 * e.g. { date: 'Mar 3, 2026', time: '10:30 AM' }
 */
export function formatContextMenuTimestamp(ms: number | undefined): { date: string; time: string } | null {
  if (!ms) return null;
  const d = new Date(ms);
  return {
    date: dateFmt.format(d),
    time: timeFmt.format(d).toLowerCase(),
  };
}

// ── Context menu state ──

export interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string;
}

// ── Menu component ──

interface NodeContextMenuPortalProps {
  menu: ContextMenuState;
  onClose: () => void;
}

export function NodeContextMenuPortal({ menu, onClose }: NodeContextMenuPortalProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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
  }, [onClose]);

  return createPortal(
    <NodeContextMenuContent
      ref={menuRef}
      x={menu.x}
      y={menu.y}
      nodeId={menu.nodeId}
      onClose={onClose}
    />,
    document.body,
  );
}

// ── Menu content ──

interface NodeContextMenuContentProps {
  x: number;
  y: number;
  nodeId: string;
  onClose: () => void;
}

const NodeContextMenuContent = forwardRef<HTMLDivElement, NodeContextMenuContentProps>(
  function NodeContextMenuContent({ x, y, nodeId, onClose }, ref) {
    const node = useNodeStore((s) => { void s._version; return loroDoc.toNodexNode(nodeId); });

    // Viewport boundary detection
    const menuWidth = 220;
    const menuHeight = 200;
    const left = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const top = y + menuHeight > window.innerHeight ? y - menuHeight : y;

    const handleCopy = useCallback(() => {
      copyNodesToClipboard([nodeId]);
      onClose();
    }, [nodeId, onClose]);

    const handleCut = useCallback(() => {
      cutNodesToClipboard([nodeId]);
      onClose();
    }, [nodeId, onClose]);

    const handleDelete = useCallback(() => {
      useNodeStore.getState().trashNode(nodeId);
      onClose();
    }, [nodeId, onClose]);

    const created = formatContextMenuTimestamp(node?.createdAt);
    const changed = formatContextMenuTimestamp(node?.updatedAt);

    return (
      <div
        ref={ref}
        className="fixed z-50 min-w-[200px] rounded-lg bg-background shadow-paper py-1 text-sm text-foreground"
        style={{ left, top }}
      >
        {/* Actions */}
        <button
          className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left"
          onClick={handleCopy}
        >
          <span>Copy</span>
          <Kbd keys="⌘C" />
        </button>
        <button
          className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left"
          onClick={handleCut}
        >
          <span>Cut</span>
          <Kbd keys="⌘X" />
        </button>
        <button
          className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-foreground/4 transition-colors text-left text-destructive"
          onClick={handleDelete}
        >
          <span>Delete</span>
        </button>

        {/* Separator */}
        <div className="mx-2 my-1 border-t border-border-subtle" />

        {/* Timestamps */}
        <div className="px-3 py-1.5 text-xs text-foreground-tertiary select-none space-y-0.5">
          {changed && (
            <div>Changed {changed.date}, {changed.time}</div>
          )}
          {created && (
            <div>Created {created.date}, {created.time}</div>
          )}
        </div>
      </div>
    );
  },
);
