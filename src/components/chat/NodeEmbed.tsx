/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Renders the node itself as an OutlinerItem (with bullet, name, tags) and
 * auto-expands it so children are visible. Supports editing and expand/collapse.
 */
import { useEffect } from 'react';
import { ExternalLink } from '../../lib/icons.js';
import { buildExpandedNodeKey } from '../../lib/expanded-node-key.js';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';
import * as loroDoc from '../../lib/loro-doc.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { CHAT_OUTLINER_PANEL_ID } from './NodePopover.js';

interface NodeEmbedProps {
  nodeId: string;
}

export function NodeEmbed({ nodeId }: NodeEmbedProps) {
  const node = useNode(nodeId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const navigateToNode = useUIStore((s) => s.navigateToNode);
  const closeChatDrawer = useUIStore((s) => s.closeChatDrawer);
  const realParentId = loroDoc.getParentId(nodeId) ?? nodeId;
  const hasChildren = (node?.children?.length ?? 0) > 0;

  // Auto-expand on mount so children are visible
  useEffect(() => {
    if (hasChildren) {
      setExpanded(buildExpandedNodeKey(realParentId, nodeId), true, true);
    }
  }, [nodeId, realParentId, hasChildren, setExpanded]);

  if (!node) {
    return (
      <div className="chat-node-embed my-1 rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground-tertiary">
        Node not found
      </div>
    );
  }

  return (
    <div className="chat-node-embed my-1 rounded-md border border-border bg-background py-1">
      <OutlinerItem
        nodeId={nodeId}
        depth={0}
        rootChildIds={[nodeId]}
        parentId={realParentId}
        rootNodeId={realParentId}
        panelId={CHAT_OUTLINER_PANEL_ID}
      />
      <div className="flex items-center justify-end border-t border-border px-2 py-1">
        <button
          type="button"
          onClick={() => {
            closeChatDrawer();
            navigateToNode(nodeId);
          }}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-foreground-secondary transition-colors hover:bg-foreground/4 hover:text-foreground"
        >
          <ExternalLink size={12} />
          Open in outliner
        </button>
      </div>
    </div>
  );
}
