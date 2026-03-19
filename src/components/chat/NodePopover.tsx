/**
 * NodePopover — popover showing an OutlinerView for a node.
 *
 * Used by NodeReference and CitationBadge (type="node") to show node details
 * in-place without navigating away from the chat.
 */
import { useCallback, type RefObject } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import { useUIStore } from '../../stores/ui-store.js';
import { OutlinerView } from '../outliner/OutlinerView.js';
import type { NodexNode } from '../../types/index.js';
import { PopoverShell } from './PopoverShell.js';
import { useState } from 'react';

/** Shared panelId for all OutlinerViews rendered inside Chat (popover + embed). */
export const CHAT_OUTLINER_PANEL_ID = 'chat';

const POPOVER_MAX_HEIGHT = 320;

// ── Hook: popover trigger state ──

/**
 * Shared hook for NodeReference.
 * Returns the click handler, close handler, and current anchor rect (null when closed).
 */
export function useNodePopover(node: NodexNode | null, triggerRef: RefObject<HTMLElement | null>) {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);

  const open = useCallback(() => {
    if (!node || !triggerRef.current) return;
    setAnchorRect(triggerRef.current.getBoundingClientRect());
  }, [node, triggerRef]);

  const close = useCallback(() => {
    setAnchorRect(null);
  }, []);

  return { anchorRect, open, close };
}

// ── Popover component ──

interface NodePopoverProps {
  nodeId: string;
  anchorRect: DOMRect;
  onClose: () => void;
}

export function NodePopover({ nodeId, anchorRect, onClose }: NodePopoverProps) {
  const navigateTo = useUIStore((s) => s.navigateTo);

  const handleOpenInPanel = useCallback(() => {
    navigateTo(nodeId);
    onClose();
  }, [navigateTo, nodeId, onClose]);

  return (
    <PopoverShell anchorRect={anchorRect} onClose={onClose}>
      <div
        className="overflow-y-auto py-1"
        style={{ maxHeight: POPOVER_MAX_HEIGHT }}
      >
        <OutlinerView rootNodeId={nodeId} panelId={CHAT_OUTLINER_PANEL_ID} />
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
    </PopoverShell>
  );
}
