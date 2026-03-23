/**
 * NodePopover — popover showing a node as an OutlinerItem.
 *
 * Used by NodeReference and CitationBadge (type="node") to show node details
 * in-place without navigating away from the chat. The node is rendered as a
 * single OutlinerItem (with bullet, name, tags) and auto-expanded.
 */
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { useUIStore } from '../../stores/ui-store.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { useNode } from '../../hooks/use-node.js';
import type { NodexNode } from '../../types/index.js';
import { PopoverShell } from './PopoverShell.js';

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
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const node = useNode(nodeId);
  const realParentId = loroDoc.getParentId(nodeId) ?? nodeId;
  const hasChildren = (node?.children?.length ?? 0) > 0;

  // Auto-expand on mount so children are visible
  useEffect(() => {
    if (hasChildren) {
      setExpanded(buildExpandedNodeKey(CHAT_OUTLINER_PANEL_ID, realParentId, nodeId), true, true);
    }
  }, [nodeId, realParentId, hasChildren, setExpanded]);

  const handleOpenInPanel = useCallback(() => {
    navigateToNode(nodeId);
    onClose();
  }, [navigateToNode, nodeId, onClose]);

  return (
    <PopoverShell anchorRect={anchorRect} onClose={onClose}>
      <div
        className="overflow-y-auto py-1"
        style={{ maxHeight: POPOVER_MAX_HEIGHT }}
      >
        <OutlinerItem
          nodeId={nodeId}
          depth={0}
          rootChildIds={[nodeId]}
          parentId={realParentId}
          rootNodeId={realParentId}
          panelId={CHAT_OUTLINER_PANEL_ID}
        />
      </div>
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={handleOpenInPanel}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
        >
          <ExternalLink size={12} />
          Open in outliner
        </button>
      </div>
    </PopoverShell>
  );
}
