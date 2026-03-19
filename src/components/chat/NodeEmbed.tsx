/**
 * NodeEmbed — inline outliner for `<node id="xxx" />` markup in chat messages.
 *
 * Renders the node itself as an OutlinerItem (with bullet, name, tags) and
 * auto-expands it so children are visible. Supports editing and expand/collapse.
 */
import { useEffect } from 'react';
import { useNode } from '../../hooks/use-node.js';
import { useUIStore } from '../../stores/ui-store.js';
import { OutlinerItem } from '../outliner/OutlinerItem.js';
import { CHAT_OUTLINER_PANEL_ID, CHAT_ROOT_PARENT_ID } from './NodePopover.js';

interface NodeEmbedProps {
  nodeId: string;
}

export function NodeEmbed({ nodeId }: NodeEmbedProps) {
  const node = useNode(nodeId);
  const setExpanded = useUIStore((s) => s.setExpanded);
  const hasChildren = (node?.children?.length ?? 0) > 0;

  // Auto-expand on mount so children are visible
  useEffect(() => {
    if (hasChildren) {
      setExpanded(`${CHAT_OUTLINER_PANEL_ID}:${CHAT_ROOT_PARENT_ID}:${nodeId}`, true, true);
    }
  }, [nodeId, hasChildren, setExpanded]);

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
        parentId={CHAT_ROOT_PARENT_ID}
        rootNodeId={CHAT_ROOT_PARENT_ID}
        panelId={CHAT_OUTLINER_PANEL_ID}
      />
    </div>
  );
}
